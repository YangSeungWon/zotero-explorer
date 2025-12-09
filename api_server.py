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
import time
import requests
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# Background sync state
sync_status = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "error": None,
    "current_step": None,
    "step_detail": None,
    "progress": None  # {"current": 50, "total": 337}
}

from zotero_api import (
    get_zotero_client,
    add_tags_to_item,
    set_tags_on_item,
    fetch_all_items,
    item_to_row,
    replace_cluster_tag,
    batch_replace_cluster_tags,
    batch_update_items
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


def run_cluster_sync_background():
    """Background task for cluster sync"""
    global sync_status

    try:
        update_sync_progress(1, "Loading papers data...")

        # Load papers.json
        papers_path = Path(__file__).parent / "papers.json"
        with open(papers_path, 'r', encoding='utf-8') as f:
            papers_data = json.load(f)

        papers = papers_data.get('papers', [])
        cluster_labels = papers_data.get('cluster_labels', {})

        update_sync_progress(1, "Fetching Zotero items...")
        zot = get_zotero_client()
        all_items = fetch_all_items(
            zot,
            include_notes=False,
            on_progress=lambda cur, tot, msg: update_sync_progress(1, msg, cur, tot)
        )

        # Build cluster mapping
        update_sync_progress(2, "Preparing cluster tags...")
        cluster_mapping = {}
        for paper in papers:
            zotero_key = paper.get('zotero_key')
            cluster_id = paper.get('cluster')
            if not zotero_key or cluster_id is None:
                continue

            label = cluster_labels.get(str(cluster_id), f"Cluster {cluster_id}")
            label = label.replace(",", " &")
            tag = f"cluster: {label}"
            cluster_mapping[zotero_key] = tag

        total = len(cluster_mapping)
        update_sync_progress(2, f"Syncing cluster tags (0/{total})...", 0, total)

        results = batch_replace_cluster_tags(
            zot, all_items, cluster_mapping,
            on_progress=lambda cur, tot: update_sync_progress(2, f"Syncing cluster tags ({cur}/{tot})...", cur, tot)
        )

        sync_status["last_result"] = {"cluster_sync": {"status": "success", **results}}
        sync_status["error"] = None
        update_sync_progress(None, "Complete")

    except Exception as e:
        print(f"Cluster sync error: {e}")
        sync_status["error"] = str(e)

    finally:
        sync_status["running"] = False
        sync_status["last_run"] = datetime.now().isoformat()
        sync_status["current_step"] = None
        sync_status["progress"] = None


@app.route('/api/cluster-sync', methods=['POST'])
def cluster_sync():
    """Start cluster sync in background"""
    global sync_status

    if sync_status["running"]:
        return jsonify({
            "status": "already_running",
            "message": "Sync is already in progress"
        })

    sync_status["running"] = True
    sync_status["error"] = None
    sync_status["last_result"] = None

    thread = threading.Thread(target=run_cluster_sync_background)
    thread.daemon = True
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Cluster sync started. Check /api/sync-status for progress."
    })


@app.route('/api/tags/sync-clusters', methods=['POST'])
def sync_cluster_tags_legacy():
    """Legacy: Sync cluster labels as tags to Zotero (blocking)"""
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


def update_sync_progress(step, detail=None, current=None, total=None):
    """Update sync progress for frontend polling"""
    global sync_status
    sync_status["current_step"] = step
    sync_status["step_detail"] = detail
    if current is not None and total is not None:
        sync_status["progress"] = {"current": current, "total": total}
    else:
        sync_status["progress"] = None


def run_full_sync_background():
    """Background task for full sync"""
    global sync_status

    try:
        results = {
            "build": {"status": "pending"},
            "cluster_sync": {"status": "pending"},
            "review_sync": {"status": "pending"},
            "citation_links": {"status": "pending"},
            "reference_cache": {"status": "pending"}
        }

        # Step 1: Run build_map.py --source api (with real-time progress)
        update_sync_progress(1, "Starting build_map.py...")
        print("Starting full sync: building papers.json from Zotero API...")

        process = subprocess.Popen(
            ["python", "-u", "build_map.py", "--source", "api"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=Path(__file__).parent
        )

        output_lines = []
        build_step_map = {
            "[1/5]": "Loading from Zotero API...",
            "[2/5]": "Processing metadata...",
            "[3/5]": "Building embeddings...",
            "[4/5]": "Reducing dimensions...",
            "[5/5]": "Clustering..."
        }

        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                line = line.strip()
                output_lines.append(line)
                print(f"  build_map: {line}")

                # Parse [X/5] progress pattern
                for prefix, desc in build_step_map.items():
                    if prefix in line:
                        update_sync_progress(1, f"Build: {desc}")
                        break

                # Parse embedding progress (Processed X/Y)
                progress_match = re.search(r'Processed (\d+)/(\d+)', line)
                if progress_match:
                    cur, tot = int(progress_match.group(1)), int(progress_match.group(2))
                    update_sync_progress(1, f"Embedding ({cur}/{tot})...", cur, tot)

        process.wait()
        if process.returncode != 0:
            stderr = process.stderr.read()
            sync_status["error"] = stderr[-500:] if stderr else "Build failed"
            sync_status["running"] = False
            return

        # Parse build output for stats
        output = "\n".join(output_lines)
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
        update_sync_progress(2, "Loading papers data...")
        papers_path = Path(__file__).parent / "papers.json"
        with open(papers_path, 'r', encoding='utf-8') as f:
            papers_data = json.load(f)

        papers = papers_data.get('papers', [])
        cluster_labels = papers_data.get('cluster_labels', {})

        zot = get_zotero_client()

        # Fetch all items once for batch operations
        update_sync_progress(2, "Fetching Zotero items...")
        print("Fetching Zotero items for batch update...")
        all_items = fetch_all_items(
            zot,
            include_notes=False,
            on_progress=lambda cur, tot, msg: update_sync_progress(2, msg, cur, tot)
        )
        item_by_key = {item['key']: item for item in all_items}

        # Step 3: Sync cluster tags (batch)
        update_sync_progress(3, "Preparing cluster tags...")
        print("Syncing cluster tags to Zotero (batch)...")

        # Build cluster mapping: zotero_key -> tag
        cluster_mapping = {}
        for paper in papers:
            zotero_key = paper.get('zotero_key')
            cluster_id = paper.get('cluster')
            if not zotero_key or cluster_id is None:
                continue

            label = cluster_labels.get(str(cluster_id), f"Cluster {cluster_id}")
            label = label.replace(",", " &")
            tag = f"cluster: {label}"
            cluster_mapping[zotero_key] = tag

        total_items = len(cluster_mapping)
        update_sync_progress(3, f"Syncing cluster tags (0/{total_items})...", 0, total_items)
        cluster_results = batch_replace_cluster_tags(
            zot, all_items, cluster_mapping,
            on_progress=lambda cur, tot: update_sync_progress(3, f"Syncing cluster tags ({cur}/{tot})...", cur, tot)
        )
        results["cluster_sync"] = {"status": "success", **cluster_results}

        # Step 4: Sync method-review tags (batch)
        update_sync_progress(4, "Preparing review tags...")
        print("Syncing method-review tags to Zotero (batch)...")
        review_results = {"success": 0, "failed": 0, "skipped": 0}

        items_to_update = []
        for paper in papers:
            zotero_key = paper.get('zotero_key')
            tags = paper.get('tags', '')

            if not zotero_key or 'method-review' not in tags:
                review_results["skipped"] += 1
                continue

            item = item_by_key.get(zotero_key)
            if not item:
                review_results["skipped"] += 1
                continue

            existing_tags = [t['tag'] for t in item['data'].get('tags', [])]
            if 'method-review' not in existing_tags:
                item['data']['tags'].append({'tag': 'method-review'})
                items_to_update.append(item)

        if items_to_update:
            total_reviews = len(items_to_update)
            update_sync_progress(4, f"Syncing review tags (0/{total_reviews})...", 0, total_reviews)
            batch_result = batch_update_items(
                zot, items_to_update,
                on_progress=lambda cur, tot: update_sync_progress(4, f"Syncing review tags ({cur}/{tot})...", cur, tot)
            )
            review_results["success"] = batch_result["success"]
            review_results["failed"] = batch_result["failed"]

        results["review_sync"] = {"status": "success", **review_results}

        # Step 5: Recalculate citation_links
        update_sync_progress(5, "Recalculating citation links...")
        print("Recalculating internal citation links...")

        s2id_to_idx = {p.get("s2_id"): p["id"] for p in papers if p.get("s2_id")}
        internal_links = []

        # From references (papers I cite)
        for paper in papers:
            paper_id = paper["id"]
            for ref_s2id in paper.get("references", []):
                if ref_s2id in s2id_to_idx:
                    target_id = s2id_to_idx[ref_s2id]
                    internal_links.append({"source": paper_id, "target": target_id})

        # From citations (papers citing me)
        for paper in papers:
            paper_id = paper["id"]
            for cite_s2id in paper.get("citations", []):
                if cite_s2id in s2id_to_idx:
                    source_id = s2id_to_idx[cite_s2id]
                    link = {"source": source_id, "target": paper_id}
                    if link not in internal_links:
                        internal_links.append(link)

        papers_data["citation_links"] = internal_links
        results["citation_links"] = {"count": len(internal_links)}
        print(f"Found {len(internal_links)} internal citation links")

        # Step 6: Fetch reference_cache for Classics
        update_sync_progress(6, "Fetching reference cache for Classics...")
        print("Caching top external references for Classics...")

        myS2Ids = set(p.get("s2_id") for p in papers if p.get("s2_id"))
        ref_counts = {}
        for paper in papers:
            for ref_id in paper.get("references", []):
                if ref_id and ref_id not in myS2Ids:
                    ref_counts[ref_id] = ref_counts.get(ref_id, 0) + 1

        # Top 500 external references
        top_refs = sorted(ref_counts.items(), key=lambda x: -x[1])[:500]
        top_ref_ids = [r[0] for r in top_refs]

        ref_cache = {}
        if top_ref_ids:
            S2_API_KEY = os.environ.get("S2_API_KEY")
            headers = {"x-api-key": S2_API_KEY} if S2_API_KEY else {}

            update_sync_progress(6, f"Fetching {len(top_ref_ids)} reference details...")
            for attempt in range(3):
                try:
                    resp = requests.post(
                        "https://api.semanticscholar.org/graph/v1/paper/batch",
                        json={"ids": top_ref_ids},
                        params={"fields": "title,citationCount"},
                        headers=headers,
                        timeout=60
                    )
                    if resp.status_code == 200:
                        for p in resp.json():
                            if p and p.get("paperId"):
                                ref_cache[p["paperId"]] = {
                                    "title": p.get("title", ""),
                                    "citations": p.get("citationCount", 0)
                                }
                        print(f"Cached {len(ref_cache)} reference details")
                        break
                    elif resp.status_code == 429:
                        wait = 30 * (attempt + 1)
                        print(f"Rate limited, waiting {wait}s... (attempt {attempt+1}/3)")
                        time.sleep(wait)
                    else:
                        print(f"Failed to fetch reference details: {resp.status_code}")
                        break
                except Exception as e:
                    print(f"Error fetching reference details: {e}")
                    if attempt < 2:
                        time.sleep(10)

        papers_data["reference_cache"] = ref_cache
        results["reference_cache"] = {"count": len(ref_cache)}

        # Save updated papers.json
        update_sync_progress(6, "Saving papers.json...")
        with open(papers_path, 'w', encoding='utf-8') as f:
            json.dump(papers_data, f, ensure_ascii=False, indent=2)
        print("Saved updated papers.json with citation_links and reference_cache")

        print("Full sync completed!")
        sync_status["last_result"] = results
        sync_status["error"] = None
        update_sync_progress(None, "Complete")

    except Exception as e:
        print(f"Full sync error: {e}")
        sync_status["error"] = str(e)

    finally:
        sync_status["running"] = False
        sync_status["last_run"] = datetime.now().isoformat()
        sync_status["current_step"] = None
        sync_status["progress"] = None


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
