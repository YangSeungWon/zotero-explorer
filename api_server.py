#!/usr/bin/env python3
"""
Flask API Server for Zotero Tag Management
- API Key authentication for write operations
- Tag CRUD operations via Zotero API
"""

import os
import json
import subprocess
import re
import threading
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# Background sync state
sync_status = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "error": None
}

from zotero_api import (
    get_zotero_client,
    add_tags_to_item,
    set_tags_on_item,
    fetch_all_items,
    item_to_row
)

# Load .env
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().strip().split("\n"):
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

app = Flask(__name__)
CORS(app)

# API Key authentication
API_KEY = os.environ.get("APP_API_KEY")


@app.before_request
def check_api_key():
    """Check API key for write operations"""
    if request.method in ['POST', 'PUT', 'DELETE']:
        if not API_KEY:
            return jsonify({"error": "Server API key not configured"}), 500

        key = request.headers.get('X-API-Key')
        if key != API_KEY:
            return jsonify({"error": "Invalid API key"}), 401


# ============================================================
# API Endpoints
# ============================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok"})


@app.route('/api/tags/paper/<zotero_key>', methods=['GET'])
def get_paper_tags(zotero_key):
    """Get tags for a specific paper"""
    try:
        zot = get_zotero_client()
        item = zot.item(zotero_key)
        tags = [t['tag'] for t in item['data'].get('tags', [])]
        return jsonify({"success": True, "tags": tags})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/tags/paper/<zotero_key>', methods=['POST'])
def update_paper_tags(zotero_key):
    """Update tags for a specific paper (replace all tags)"""
    try:
        data = request.json
        tags = data.get('tags', [])

        zot = get_zotero_client()
        success = set_tags_on_item(zot, zotero_key, tags)

        if success:
            # Update local papers.json
            update_papers_json_tags(zotero_key, tags)
            return jsonify({"success": True, "tags": tags})
        else:
            return jsonify({"success": False, "error": "Failed to update tags"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/tags/paper/<zotero_key>/add', methods=['POST'])
def add_paper_tags(zotero_key):
    """Add tags to a paper (preserves existing)"""
    try:
        data = request.json
        new_tags = data.get('tags', [])

        zot = get_zotero_client()
        success = add_tags_to_item(zot, zotero_key, new_tags)

        if success:
            # Get updated tags
            item = zot.item(zotero_key)
            all_tags = [t['tag'] for t in item['data'].get('tags', [])]
            update_papers_json_tags(zotero_key, all_tags)
            return jsonify({"success": True, "tags": all_tags})
        else:
            return jsonify({"success": False, "error": "Failed to add tags"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/tags/batch', methods=['POST'])
def batch_tag_operation():
    """Batch add/remove tags for multiple papers"""
    try:
        data = request.json
        action = data.get('action')  # 'add' or 'remove'
        tag = data.get('tag')
        zotero_keys = data.get('zotero_keys', [])

        if not action or not tag or not zotero_keys:
            return jsonify({"error": "Missing required fields"}), 400

        zot = get_zotero_client()
        results = {"success": 0, "failed": 0}

        for key in zotero_keys:
            try:
                item = zot.item(key)
                existing_tags = [t['tag'] for t in item['data'].get('tags', [])]

                if action == 'add':
                    if tag not in existing_tags:
                        existing_tags.append(tag)
                elif action == 'remove':
                    existing_tags = [t for t in existing_tags if t != tag]

                item['data']['tags'] = [{'tag': t} for t in existing_tags]
                zot.update_item(item)

                # Update local papers.json
                update_papers_json_tags(key, existing_tags)

                results["success"] += 1
            except Exception as e:
                print(f"Error processing {key}: {e}")
                results["failed"] += 1

        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/tags/sync-clusters', methods=['POST'])
def sync_cluster_tags():
    """Sync cluster labels as tags to Zotero"""
    try:
        data = request.json
        prefix = data.get('prefix', 'cluster:')
        cluster_labels = data.get('cluster_labels', {})

        # Load papers.json to get cluster mapping
        papers_path = Path(__file__).parent / "papers.json"
        with open(papers_path, 'r', encoding='utf-8') as f:
            papers_data = json.load(f)

        papers = papers_data.get('papers', papers_data)

        zot = get_zotero_client()
        results = {"success": 0, "failed": 0, "skipped": 0}

        for paper in papers:
            zotero_key = paper.get('zotero_key')
            cluster_id = paper.get('cluster')

            if not zotero_key:
                results["skipped"] += 1
                continue

            # Get cluster label
            label = cluster_labels.get(str(cluster_id), cluster_labels.get(cluster_id, f"Cluster {cluster_id}"))
            tag = f"{prefix}{label}"

            try:
                if add_tags_to_item(zot, zotero_key, [tag]):
                    results["success"] += 1
                else:
                    results["failed"] += 1
            except Exception as e:
                print(f"Error syncing {zotero_key}: {e}")
                results["failed"] += 1

        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/papers/reload', methods=['POST'])
def reload_papers():
    """Reload papers from Zotero API and update papers.json"""
    try:
        zot = get_zotero_client()
        items = fetch_all_items(zot)

        # This would need the full build_map logic
        # For now, just return the count
        return jsonify({
            "success": True,
            "message": f"Fetched {len(items)} items. Run build_map.py --source api to regenerate papers.json"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def run_full_sync_background():
    """Background task for full sync"""
    global sync_status

    try:
        results = {
            "build": {"status": "pending"},
            "cluster_sync": {"status": "pending"},
            "review_sync": {"status": "pending"}
        }

        # Step 1: Run build_map.py --source api
        print("Starting full sync: building papers.json from Zotero API...")
        build_result = subprocess.run(
            ["python", "build_map.py", "--source", "api"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent,
            timeout=600  # 10 minute timeout
        )

        if build_result.returncode != 0:
            sync_status["error"] = build_result.stderr[-500:] if build_result.stderr else "Build failed"
            sync_status["running"] = False
            return

        # Parse build output for stats
        output = build_result.stdout
        papers_match = re.search(r'Papers: (\d+)', output)
        clusters_match = re.search(r'Clusters: (\d+)', output)
        reviews_match = re.search(r'Auto-tagged reviews: (\d+)', output)

        results["build"] = {
            "status": "success",
            "papers": int(papers_match.group(1)) if papers_match else 0,
            "clusters": int(clusters_match.group(1)) if clusters_match else 0,
            "auto_reviews": int(reviews_match.group(1)) if reviews_match else 0
        }

        # Step 2: Load papers.json for cluster and tag sync
        papers_path = Path(__file__).parent / "papers.json"
        with open(papers_path, 'r', encoding='utf-8') as f:
            papers_data = json.load(f)

        papers = papers_data.get('papers', [])
        cluster_labels = papers_data.get('cluster_labels', {})

        zot = get_zotero_client()

        # Step 3: Sync cluster tags
        print("Syncing cluster tags to Zotero...")
        cluster_results = {"success": 0, "failed": 0, "skipped": 0}

        for paper in papers:
            zotero_key = paper.get('zotero_key')
            cluster_id = paper.get('cluster')

            if not zotero_key:
                cluster_results["skipped"] += 1
                continue

            label = cluster_labels.get(str(cluster_id), f"Cluster {cluster_id}")
            tag = f"cluster: {label}"

            try:
                if add_tags_to_item(zot, zotero_key, [tag]):
                    cluster_results["success"] += 1
                else:
                    cluster_results["failed"] += 1
            except Exception as e:
                cluster_results["failed"] += 1

        results["cluster_sync"] = {"status": "success", **cluster_results}

        # Step 4: Sync method-review tags
        print("Syncing method-review tags to Zotero...")
        review_results = {"success": 0, "failed": 0, "skipped": 0}

        for paper in papers:
            zotero_key = paper.get('zotero_key')
            tags = paper.get('tags', '')

            if not zotero_key:
                review_results["skipped"] += 1
                continue

            if 'method-review' in tags:
                try:
                    if add_tags_to_item(zot, zotero_key, ['method-review']):
                        review_results["success"] += 1
                    else:
                        review_results["failed"] += 1
                except Exception as e:
                    review_results["failed"] += 1
            else:
                review_results["skipped"] += 1

        results["review_sync"] = {"status": "success", **review_results}

        print("Full sync completed!")
        sync_status["last_result"] = results
        sync_status["error"] = None

    except Exception as e:
        print(f"Full sync error: {e}")
        sync_status["error"] = str(e)

    finally:
        sync_status["running"] = False
        sync_status["last_run"] = datetime.now().isoformat()


@app.route('/api/full-sync', methods=['POST'])
def full_sync():
    """Start full sync in background"""
    global sync_status

    if sync_status["running"]:
        return jsonify({
            "status": "already_running",
            "message": "Sync is already in progress"
        })

    sync_status["running"] = True
    sync_status["error"] = None

    thread = threading.Thread(target=run_full_sync_background)
    thread.daemon = True
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Full sync started in background. Check /api/sync-status for progress."
    })


@app.route('/api/sync-status', methods=['GET'])
def get_sync_status():
    """Get current sync status"""
    return jsonify(sync_status)


# ============================================================
# Helper Functions
# ============================================================

def update_papers_json_tags(zotero_key: str, tags: list):
    """Update tags in papers.json for a specific paper"""
    papers_path = Path(__file__).parent / "papers.json"

    try:
        with open(papers_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        papers = data.get('papers', data)

        for paper in papers:
            if paper.get('zotero_key') == zotero_key:
                paper['tags'] = ', '.join(tags)
                break

        if 'papers' in data:
            data['papers'] = papers
        else:
            data = papers

        with open(papers_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    except Exception as e:
        print(f"Error updating papers.json: {e}")


# ============================================================
# Main
# ============================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    print(f"Starting API server on port {port}")
    print(f"API Key configured: {'Yes' if API_KEY else 'No'}")

    app.run(host='0.0.0.0', port=port, debug=debug)
