#!/usr/bin/env python3
"""
Sync cluster labels as tags to Zotero
- Read papers.json with cluster assignments
- Update Zotero items with cluster tags
"""

import json
import argparse
from pathlib import Path
from zotero_api import get_zotero_client, replace_cluster_tag


def load_papers(json_path: str = "papers.json") -> dict:
    """Load papers.json and extract cluster mapping"""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    papers = data.get("papers", data)
    cluster_labels = data.get("cluster_labels", {})

    return papers, cluster_labels


def sync_cluster_tags(
    papers: list,
    cluster_labels: dict,
    tag_prefix: str = "cluster:",
    dry_run: bool = False
):
    """Sync cluster labels as tags to Zotero"""
    zot = get_zotero_client()

    # Filter papers with zotero_key
    papers_with_key = [p for p in papers if p.get("zotero_key")]
    print(f"Found {len(papers_with_key)} papers with Zotero keys")

    if not papers_with_key:
        print("No papers with Zotero keys found. Run build_map.py with --source api first.")
        return

    results = {"success": 0, "failed": 0, "skipped": 0}

    for i, paper in enumerate(papers_with_key):
        zotero_key = paper["zotero_key"]
        cluster_id = paper.get("cluster")

        if cluster_id is None:
            results["skipped"] += 1
            continue

        # Get cluster label
        label = cluster_labels.get(str(cluster_id), cluster_labels.get(cluster_id, f"Cluster {cluster_id}"))
        # Remove commas from label (Zotero uses commas as tag separators)
        label = label.replace(",", " &")
        tag = f"{tag_prefix}{label}"

        print(f"[{i+1}/{len(papers_with_key)}] {paper['title'][:50]}...")
        print(f"  -> Tag: {tag}")

        if dry_run:
            results["success"] += 1
            continue

        try:
            # Replace old cluster tags with new one
            if replace_cluster_tag(zot, zotero_key, tag):
                results["success"] += 1
            else:
                results["failed"] += 1
        except Exception as e:
            print(f"  Error: {e}")
            results["failed"] += 1

    return results


def remove_cluster_tags(tag_prefix: str = "cluster:", dry_run: bool = False):
    """Remove all cluster tags from Zotero library"""
    zot = get_zotero_client()

    print(f"Fetching items with '{tag_prefix}*' tags...")

    # Get all items
    items = zot.everything(zot.top())

    modified = 0
    for item in items:
        tags = item['data'].get('tags', [])
        original_count = len(tags)

        # Filter out cluster tags
        new_tags = [t for t in tags if not t['tag'].startswith(tag_prefix)]

        if len(new_tags) < original_count:
            removed = [t['tag'] for t in tags if t['tag'].startswith(tag_prefix)]
            print(f"  {item['data'].get('title', 'No title')[:50]}")
            print(f"    Removing: {removed}")

            if not dry_run:
                item['data']['tags'] = new_tags
                zot.update_item(item)

            modified += 1

    print(f"\nModified {modified} items")
    return modified


def main():
    parser = argparse.ArgumentParser(description="Sync cluster tags to Zotero")
    parser.add_argument("--input", default="papers.json", help="Input papers.json file")
    parser.add_argument("--prefix", default="cluster:", help="Tag prefix (default: 'cluster:')")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    parser.add_argument("--remove", action="store_true", help="Remove cluster tags instead of adding")
    args = parser.parse_args()

    if args.dry_run:
        print("=== DRY RUN MODE ===\n")

    if args.remove:
        print(f"Removing tags with prefix '{args.prefix}'...")
        remove_cluster_tags(args.prefix, args.dry_run)
    else:
        print(f"Syncing cluster tags to Zotero...")
        papers, cluster_labels = load_papers(args.input)
        results = sync_cluster_tags(papers, cluster_labels, args.prefix, args.dry_run)

        print(f"\n=== Results ===")
        print(f"  Success: {results['success']}")
        print(f"  Failed: {results['failed']}")
        print(f"  Skipped: {results['skipped']}")


if __name__ == "__main__":
    main()
