#!/usr/bin/env python3
"""
Zotero API wrapper using pyzotero
- Fetch items from Zotero library
- Update tags on items
"""

import os
import re
from pathlib import Path
from typing import Optional
from pyzotero import zotero


def extract_year(date_str: str) -> str:
    """다양한 날짜 형식에서 연도 추출

    Examples:
        "2024" → "2024"
        "2024-01-15" → "2024"
        "12월 1, 2006" → "2006"
        "January 2020" → "2020"
    """
    if not date_str:
        return ""

    # 4자리 연도 찾기 (1900-2099)
    match = re.search(r'\b(19|20)\d{2}\b', date_str)
    if match:
        return match.group(0)

    return ""

# Load .env
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().strip().split("\n"):
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def get_zotero_client(
    library_id: Optional[str] = None,
    api_key: Optional[str] = None,
    library_type: Optional[str] = None
) -> zotero.Zotero:
    """Get authenticated Zotero client"""
    library_id = library_id or os.environ.get("ZOTERO_LIBRARY_ID")
    api_key = api_key or os.environ.get("ZOTERO_API_KEY")
    library_type = library_type or os.environ.get("ZOTERO_LIBRARY_TYPE", "user")

    if not library_id or not api_key:
        raise ValueError(
            "ZOTERO_LIBRARY_ID and ZOTERO_API_KEY must be set in .env or passed as arguments"
        )

    return zotero.Zotero(library_id, library_type, api_key)


def fetch_all_items(zot: zotero.Zotero, include_notes: bool = True) -> list[dict]:
    """Fetch all items from library"""
    print("Fetching items from Zotero API...")

    # Fetch all top-level items (not child items like attachments)
    items = zot.everything(zot.top())

    print(f"Fetched {len(items)} items")

    if include_notes:
        # Fetch notes for each item
        print("Fetching notes...")
        for item in items:
            item_key = item['key']
            children = zot.children(item_key)
            notes = [c for c in children if c['data'].get('itemType') == 'note']
            item['_notes'] = notes

    return items


def item_to_row(item: dict) -> dict:
    """Convert Zotero API item to CSV-like row format for compatibility"""
    data = item['data']

    # Extract creators
    creators = data.get('creators', [])
    authors = "; ".join([
        f"{c.get('lastName', '')}, {c.get('firstName', '')}"
        if c.get('lastName') else c.get('name', '')
        for c in creators
    ])

    # Extract tags (세미콜론 구분 - CSV 형식과 동일)
    tags = "; ".join([t['tag'] for t in data.get('tags', [])])

    # Extract notes
    notes_content = ""
    if '_notes' in item:
        notes_content = "\n\n".join([
            n['data'].get('note', '') for n in item['_notes']
        ])

    # Map to CSV column names
    row = {
        'Key': item['key'],
        'Item Type': data.get('itemType', ''),
        'Title': data.get('title', ''),
        'Author': authors,
        'Abstract Note': data.get('abstractNote', ''),
        'Publication Title': data.get('publicationTitle', ''),
        'Conference Name': data.get('conferenceName', ''),
        'Proceedings Title': data.get('proceedingsTitle', ''),
        'Series': data.get('series', ''),
        'Publication Year': extract_year(data.get('date', '')),
        'Date': data.get('date', ''),
        'DOI': data.get('DOI', ''),
        'Url': data.get('url', ''),
        'Manual Tags': tags,
        'Notes': notes_content,
        # Store original for later sync
        '_zotero_item': item,
    }

    return row


def fetch_items_as_dataframe(zot: zotero.Zotero):
    """Fetch items and return as pandas DataFrame (CSV-compatible)"""
    import pandas as pd

    items = fetch_all_items(zot)
    rows = [item_to_row(item) for item in items]

    return pd.DataFrame(rows)


def add_tags_to_item(zot: zotero.Zotero, item_key: str, new_tags: list[str]) -> bool:
    """Add tags to a Zotero item (preserves existing tags)"""
    try:
        item = zot.item(item_key)
        existing_tags = [t['tag'] for t in item['data'].get('tags', [])]

        # Merge tags (avoid duplicates)
        all_tags = list(set(existing_tags + new_tags))
        item['data']['tags'] = [{'tag': t} for t in all_tags]

        zot.update_item(item)
        return True
    except Exception as e:
        print(f"Error updating item {item_key}: {e}")
        return False


def set_tags_on_item(zot: zotero.Zotero, item_key: str, tags: list[str]) -> bool:
    """Set tags on a Zotero item (replaces existing tags)"""
    try:
        item = zot.item(item_key)
        item['data']['tags'] = [{'tag': t} for t in tags]
        zot.update_item(item)
        return True
    except Exception as e:
        print(f"Error updating item {item_key}: {e}")
        return False


def sync_cluster_tags(
    zot: zotero.Zotero,
    cluster_mapping: dict[str, int],  # item_key -> cluster_id
    cluster_labels: dict[int, str],   # cluster_id -> label
    tag_prefix: str = "cluster:"
) -> dict:
    """Sync cluster labels as tags to Zotero items"""
    results = {"success": 0, "failed": 0, "skipped": 0}

    for item_key, cluster_id in cluster_mapping.items():
        label = cluster_labels.get(cluster_id, f"Cluster {cluster_id}")
        tag = f"{tag_prefix}{label}"

        if add_tags_to_item(zot, item_key, [tag]):
            results["success"] += 1
            print(f"  Tagged {item_key}: {tag}")
        else:
            results["failed"] += 1

    return results


# CLI for testing
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Zotero API tools")
    parser.add_argument("--test", action="store_true", help="Test connection")
    parser.add_argument("--fetch", action="store_true", help="Fetch and print items")
    parser.add_argument("--count", action="store_true", help="Count items")
    args = parser.parse_args()

    try:
        zot = get_zotero_client()

        if args.test:
            # Test connection
            collections = zot.collections()
            print(f"Connected! Found {len(collections)} collections")
            for c in collections[:5]:
                print(f"  - {c['data']['name']}")

        if args.count:
            items = zot.top(limit=1)
            total = zot.num_items()
            print(f"Total items: {total}")

        if args.fetch:
            items = fetch_all_items(zot, include_notes=False)
            for item in items[:5]:
                print(f"- {item['data'].get('title', 'No title')}")
            print(f"... and {len(items) - 5} more")

    except ValueError as e:
        print(f"Error: {e}")
        print("\nPlease create .env file with:")
        print("ZOTERO_LIBRARY_ID=your_library_id")
        print("ZOTERO_API_KEY=your_api_key")
