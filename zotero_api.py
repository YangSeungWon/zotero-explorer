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


def fetch_all_items(zot: zotero.Zotero, include_notes: bool = True, include_pdfs: bool = True, on_progress=None) -> list[dict]:
    """Fetch all items from library with optional progress callback

    Args:
        zot: Zotero client
        include_notes: Whether to fetch notes for each item
        include_pdfs: Whether to fetch PDF attachment URLs
        on_progress: Callback function(current, total, message) for progress updates
    """
    print("Fetching items from Zotero API...")

    # Get total count first
    total = zot.num_items()
    print(f"Total items to fetch: {total}")

    if on_progress:
        on_progress(0, total, f"Fetching items (0/{total})...")

    # Fetch in batches for progress tracking
    batch_size = 100
    items = []
    start = 0

    while start < total:
        batch = zot.top(limit=batch_size, start=start)
        if not batch:
            break
        items.extend(batch)
        start += len(batch)

        if on_progress:
            on_progress(len(items), total, f"Fetching items ({len(items)}/{total})...")
        print(f"  Fetched {len(items)}/{total} items...")

    print(f"Fetched {len(items)} items")

    if include_notes:
        # Fetch ALL notes at once (much faster than N+1 children calls)
        print("Fetching all notes...")
        if on_progress:
            on_progress(0, 1, "Fetching all notes...")

        all_notes = []
        note_start = 0
        while True:
            batch = zot.items(itemType='note', limit=100, start=note_start)
            if not batch:
                break
            all_notes.extend(batch)
            note_start += len(batch)
            print(f"  Fetched {len(all_notes)} notes...")

        print(f"Fetched {len(all_notes)} notes total")

        # Build parent -> notes mapping
        notes_by_parent = {}
        for note in all_notes:
            parent_key = note['data'].get('parentItem')
            if parent_key:
                if parent_key not in notes_by_parent:
                    notes_by_parent[parent_key] = []
                notes_by_parent[parent_key].append(note)

        # Assign notes to items
        for item in items:
            item['_notes'] = notes_by_parent.get(item['key'], [])

        if on_progress:
            on_progress(1, 1, f"Matched notes to {len([i for i in items if i['_notes']])} items")

    if include_pdfs:
        # Fetch ALL PDF attachments at once
        print("Fetching PDF attachments...")
        if on_progress:
            on_progress(0, 1, "Fetching PDF attachments...")

        all_attachments = []
        att_start = 0
        while True:
            batch = zot.items(itemType='attachment', limit=100, start=att_start)
            if not batch:
                break
            all_attachments.extend(batch)
            att_start += len(batch)
            print(f"  Fetched {len(all_attachments)} attachments...")

        # Filter PDFs and build parent -> pdf_key mapping (for Zotero deep links)
        pdfs_by_parent = {}
        for att in all_attachments:
            data = att['data']
            if data.get('contentType') == 'application/pdf':
                parent_key = data.get('parentItem')
                att_key = att['key']  # Attachment key for zotero://open-pdf
                if parent_key and att_key:
                    # Prefer first PDF (usually the main one)
                    if parent_key not in pdfs_by_parent:
                        pdfs_by_parent[parent_key] = att_key

        print(f"Found {len(pdfs_by_parent)} PDFs total")

        # Assign PDF keys to items
        for item in items:
            item['_pdf_key'] = pdfs_by_parent.get(item['key'], '')

        if on_progress:
            on_progress(1, 1, f"Matched PDFs to {len([i for i in items if i['_pdf_key']])} items")

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
        'PDF Key': item.get('_pdf_key', ''),
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


def replace_cluster_tag(zot: zotero.Zotero, item_key: str, new_tag: str) -> bool:
    """Remove all cluster: tags and add the new one"""
    try:
        item = zot.item(item_key)
        existing_tags = item['data'].get('tags', [])

        # Remove all cluster: tags
        non_cluster_tags = [t for t in existing_tags if not t.get('tag', '').startswith('cluster:')]

        # Add new cluster tag
        non_cluster_tags.append({'tag': new_tag})
        item['data']['tags'] = non_cluster_tags

        zot.update_item(item)
        return True
    except Exception as e:
        print(f"Error updating item {item_key}: {e}")
        return False


def batch_update_items(zot: zotero.Zotero, items: list, batch_size: int = 50, on_progress=None) -> dict:
    """Update multiple items in batches (much faster than individual updates)

    Items should be full Zotero item objects with 'data' containing updated tags.
    This function extracts key, version, and tags for PATCH-style updates.
    """
    results = {"success": 0, "failed": 0}
    total = len(items)

    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        # Convert to PATCH format (only key, version, and tags)
        payloads = []
        for item in batch:
            payload = {
                'key': item['key'],
                'version': item['version'],
                'tags': item['data']['tags']
            }
            payloads.append(payload)
        try:
            zot.update_items(payloads)
            results["success"] += len(batch)
            print(f"  Batch {i//batch_size + 1}: {len(batch)} items updated")
        except Exception as e:
            print(f"  Batch {i//batch_size + 1} failed: {e}")
            results["failed"] += len(batch)

        # Report progress
        if on_progress:
            on_progress(min(i + batch_size, total), total)

    return results


def batch_replace_cluster_tags(
    zot: zotero.Zotero,
    items: list,
    cluster_mapping: dict,  # zotero_key -> new_tag
    batch_size: int = 50,
    on_progress=None
) -> dict:
    """Replace cluster tags for multiple items in batches"""
    results = {"success": 0, "failed": 0, "skipped": 0}

    # Build item lookup by key
    item_by_key = {item['key']: item for item in items}

    # Prepare items for update
    items_to_update = []
    for zotero_key, new_tag in cluster_mapping.items():
        item = item_by_key.get(zotero_key)
        if not item:
            results["skipped"] += 1
            continue

        existing_tags = item['data'].get('tags', [])

        # Check if already has correct tag
        current_cluster_tags = [t['tag'] for t in existing_tags if t.get('tag', '').startswith('cluster:')]
        if len(current_cluster_tags) == 1 and current_cluster_tags[0] == new_tag:
            results["skipped"] += 1
            continue

        # Remove all cluster: tags and add new one
        non_cluster_tags = [t for t in existing_tags if not t.get('tag', '').startswith('cluster:')]
        non_cluster_tags.append({'tag': new_tag})

        # For batch update, we only need to send changed fields (PATCH semantics)
        # pyzotero's update_items expects data dicts with key and version
        update_payload = {
            'key': item['key'],
            'version': item['version'],
            'tags': non_cluster_tags
        }
        items_to_update.append(update_payload)

    print(f"  {len(items_to_update)} items need update, {results['skipped']} skipped")
    total = len(items_to_update)

    # Batch update
    for i in range(0, total, batch_size):
        batch = items_to_update[i:i + batch_size]
        try:
            zot.update_items(batch)
            results["success"] += len(batch)
            print(f"  Batch {i//batch_size + 1}/{(total-1)//batch_size + 1}: {len(batch)} items")
        except Exception as e:
            print(f"  Batch {i//batch_size + 1} failed: {e}")
            results["failed"] += len(batch)

        # Report progress
        if on_progress:
            on_progress(min(i + batch_size, total), total)

    return results


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
        # Remove commas from label (Zotero uses commas as tag separators)
        label = label.replace(",", " &")
        tag = f"{tag_prefix}{label}"

        # Replace old cluster tags with new one
        if replace_cluster_tag(zot, item_key, tag):
            results["success"] += 1
            print(f"  Tagged {item_key}: {tag}")
        else:
            results["failed"] += 1

    return results


# =====================================================
# Ideas API - Brainstorming notes stored in Zotero
# =====================================================

IDEAS_COLLECTION_NAME = "Ideas"


def get_or_create_ideas_collection(zot: zotero.Zotero) -> str:
    """Get or create the Ideas collection, returns collection key"""
    collections = zot.collections()

    for c in collections:
        if c['data']['name'] == IDEAS_COLLECTION_NAME:
            return c['key']

    # Create new collection
    new_collection = zot.create_collections([{'name': IDEAS_COLLECTION_NAME}])
    if new_collection and 'success' in new_collection:
        # new_collection['success'] is a dict like {'0': 'KEY123'}
        return list(new_collection['success'].values())[0]

    raise Exception(f"Failed to create {IDEAS_COLLECTION_NAME} collection")


def fetch_ideas(zot: zotero.Zotero) -> list[dict]:
    """Fetch all ideas (standalone notes) from Ideas collection"""
    try:
        collection_key = get_or_create_ideas_collection(zot)
    except Exception as e:
        print(f"Error getting Ideas collection: {e}")
        return []

    # Fetch items in collection
    items = zot.collection_items(collection_key, itemType='note')

    # Parse each idea
    ideas = []
    for item in items:
        idea = parse_idea_from_note(item)
        if idea:
            ideas.append(idea)

    return ideas


def parse_idea_from_note(item: dict) -> dict | None:
    """Parse structured idea from Zotero note HTML"""
    import re
    from html.parser import HTMLParser

    note_html = item['data'].get('note', '')
    if not note_html:
        return None

    # Extract data attributes from root div
    idea = {
        'zotero_key': item['key'],
        'version': item['version'],
    }

    # Parse data-* attributes from <div class="idea" ...>
    idea_match = re.search(
        r'<div[^>]*class="idea"[^>]*'
        r'data-id="([^"]*)"[^>]*'
        r'data-status="([^"]*)"[^>]*'
        r'data-created="([^"]*)"[^>]*'
        r'data-updated="([^"]*)"',
        note_html, re.IGNORECASE
    )

    if idea_match:
        idea['id'] = idea_match.group(1)
        idea['status'] = idea_match.group(2)
        idea['created'] = idea_match.group(3)
        idea['updated'] = idea_match.group(4)
    else:
        # Fallback: generate ID, use defaults
        idea['id'] = f"idea-{item['key']}"
        idea['status'] = 'drafting'
        idea['created'] = item['data'].get('dateAdded', '')[:10]
        idea['updated'] = item['data'].get('dateModified', '')[:10]

    # Extract title from <h1>
    title_match = re.search(r'<h1[^>]*>(.*?)</h1>', note_html, re.IGNORECASE | re.DOTALL)
    idea['title'] = title_match.group(1).strip() if title_match else 'Untitled Idea'

    # Extract description from <div class="description">
    desc_match = re.search(
        r'<div[^>]*class="description"[^>]*>(.*?)</div>',
        note_html, re.IGNORECASE | re.DOTALL
    )
    idea['description'] = desc_match.group(1).strip() if desc_match else ''

    # Extract connected papers from data-keys attribute
    papers_match = re.search(
        r'<div[^>]*class="connected-papers"[^>]*data-keys="([^"]*)"',
        note_html, re.IGNORECASE
    )
    if papers_match and papers_match.group(1):
        idea['connected_papers'] = [k.strip() for k in papers_match.group(1).split(',') if k.strip()]
    else:
        idea['connected_papers'] = []

    # Extract keywords from data-keywords attribute (pipe-delimited)
    keywords_match = re.search(
        r'<div[^>]*class="keywords"[^>]*data-keywords="([^"]*)"',
        note_html, re.IGNORECASE
    )
    if keywords_match and keywords_match.group(1):
        idea['keywords'] = [k.strip() for k in keywords_match.group(1).split('|') if k.strip()]
    else:
        idea['keywords'] = []

    return idea


def create_idea_html(idea: dict) -> str:
    """Create structured HTML from idea dict"""
    from datetime import datetime
    import html as html_lib

    idea_id = idea.get('id', f"idea-{datetime.now().strftime('%Y%m%d%H%M%S')}")
    status = idea.get('status', 'drafting')
    created = idea.get('created', datetime.now().strftime('%Y-%m-%d'))
    updated = idea.get('updated', datetime.now().strftime('%Y-%m-%d'))
    title = idea.get('title', 'Untitled Idea')
    description = idea.get('description', '')
    connected_papers = idea.get('connected_papers', [])
    keywords = idea.get('keywords', [])

    papers_keys = ','.join(connected_papers) if connected_papers else ''
    # Use pipe delimiter for keywords (to allow commas in keyword text)
    keywords_data = '|'.join(keywords) if keywords else ''
    # Format keywords for display
    keywords_display = ', '.join([html_lib.escape(k) for k in keywords]) if keywords else '<em>None</em>'

    result = f'''<div class="idea" data-id="{idea_id}" data-status="{status}" data-created="{created}" data-updated="{updated}">
  <h1>{title}</h1>
  <div class="description">
    {description}
  </div>
  <div class="keywords" data-keywords="{html_lib.escape(keywords_data)}">
    <strong>Keywords to Explore:</strong> {keywords_display}
  </div>
  <div class="connected-papers" data-keys="{papers_keys}">
  </div>
</div>'''

    return result


def create_idea(zot: zotero.Zotero, idea: dict) -> dict | None:
    """Create a new idea as standalone note in Ideas collection"""
    from datetime import datetime

    collection_key = get_or_create_ideas_collection(zot)

    # Ensure required fields
    if 'id' not in idea:
        idea['id'] = f"idea-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    if 'created' not in idea:
        idea['created'] = datetime.now().strftime('%Y-%m-%d')
    if 'updated' not in idea:
        idea['updated'] = datetime.now().strftime('%Y-%m-%d')
    if 'status' not in idea:
        idea['status'] = 'drafting'

    note_html = create_idea_html(idea)

    # Create standalone note
    note_data = {
        'itemType': 'note',
        'note': note_html,
        'collections': [collection_key],
        'tags': [{'tag': 'idea'}]
    }

    try:
        result = zot.create_items([note_data])
        if result and 'success' in result:
            new_key = list(result['success'].values())[0]
            idea['zotero_key'] = new_key
            return idea
    except Exception as e:
        print(f"Error creating idea: {e}")

    return None


def update_idea(zot: zotero.Zotero, idea: dict) -> bool:
    """Update an existing idea"""
    from datetime import datetime

    if 'zotero_key' not in idea:
        print("Error: idea must have zotero_key")
        return False

    try:
        item = zot.item(idea['zotero_key'])

        # Update timestamp
        idea['updated'] = datetime.now().strftime('%Y-%m-%d')

        # Generate new HTML
        note_html = create_idea_html(idea)
        item['data']['note'] = note_html

        zot.update_item(item)
        return True
    except Exception as e:
        print(f"Error updating idea: {e}")
        return False


def delete_idea(zot: zotero.Zotero, zotero_key: str) -> bool:
    """Delete an idea"""
    try:
        item = zot.item(zotero_key)
        zot.delete_item(item)
        return True
    except Exception as e:
        print(f"Error deleting idea: {e}")
        return False


# CLI for testing
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Zotero API tools")
    parser.add_argument("--test", action="store_true", help="Test connection")
    parser.add_argument("--fetch", action="store_true", help="Fetch and print items")
    parser.add_argument("--count", action="store_true", help="Count items")
    parser.add_argument("--ideas", action="store_true", help="List ideas")
    parser.add_argument("--create-idea", type=str, help="Create test idea with title")
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

        if args.ideas:
            ideas = fetch_ideas(zot)
            print(f"Found {len(ideas)} ideas:")
            for idea in ideas:
                papers_count = len(idea.get('connected_papers', []))
                print(f"  [{idea['status']}] {idea['title']} ({papers_count} papers)")

        if args.create_idea:
            idea = create_idea(zot, {
                'title': args.create_idea,
                'description': '<p>Test description</p>',
                'status': 'drafting'
            })
            if idea:
                print(f"Created idea: {idea['title']} (key: {idea['zotero_key']})")
            else:
                print("Failed to create idea")

    except ValueError as e:
        print(f"Error: {e}")
        print("\nPlease create .env file with:")
        print("ZOTERO_LIBRARY_ID=your_library_id")
        print("ZOTERO_API_KEY=your_api_key")
