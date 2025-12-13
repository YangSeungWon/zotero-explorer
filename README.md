# Zotero Explorer

Interactive visualization tool for your Zotero paper library. Explore your research collection through semantic clustering, citation networks, and AI-powered search.

[한국어](README_ko.md)

## Features

### Visualization
- **Map View**: 2D scatter plot with semantic clustering (UMAP + KMeans)
- **Timeline View**: Papers plotted by year and cluster
- **List View**: Sortable table with metadata

### Filtering & Search
- Quick filters: Venue quality, tags, year range, bookmarks
- Text search across titles, authors, abstracts
- Semantic search using sentence-transformers embeddings
- Advanced filter pipeline builder

### Citation Network
- Blue lines: References (papers you cite)
- Orange lines: Cited by (papers citing yours)
- Discovery features:
  - **Classics**: Frequently cited papers not in your library
  - **New Work**: Recent papers citing your collection

### Research Management
- Bookmark papers (syncs as "starred" tag to Zotero)
- Create and manage research ideas
- Link papers to ideas
- Batch tag operations
- Two-way Zotero sync (cluster labels, custom tags)

## Quick Start

### Option 1: Static (No Server)

```bash
# 1. Setup
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env with your Zotero credentials

# 3. Build map
python build_map.py --source api

# 4. Fetch citations (optional)
python fetch_citations.py

# 5. Open in browser
open index.html
# or serve locally
python -m http.server 8080
```

### Option 2: With API Server (Full Features)

```bash
# 1. Setup (same as above)

# 2. Start server
docker-compose up -d
# or
python api_server.py

# 3. Access at http://localhost:20680
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `ZOTERO_LIBRARY_ID` | Yes | Your Zotero library ID |
| `ZOTERO_API_KEY` | Yes | Zotero API key ([Get here](https://www.zotero.org/settings/keys)) |
| `ZOTERO_LIBRARY_TYPE` | Yes | `user` or `group` |
| `S2_API_KEY` | No | Semantic Scholar API key (anonymous access works, key for higher rate limits) |
| `APP_API_KEY` | Server only | Authentication key for API server |

## Scripts

| Script | Description |
|--------|-------------|
| `build_map.py` | Build papers.json with embeddings and clustering |
| `fetch_citations.py` | Fetch citation data from Semantic Scholar |
| `api_server.py` | Flask API server for full sync features |
| `zotero_api.py` | Zotero API utilities |

### build_map.py Options

```bash
python build_map.py --source api        # Fetch from Zotero API (recommended)
python build_map.py --source csv        # Use exported CSV file
python build_map.py --clusters 10       # Number of clusters
python build_map.py --notes-only        # Only papers with notes
python build_map.py --embedding openai  # Use OpenAI embeddings
```

## Tech Stack

- **Frontend**: Vanilla JS, Plotly.js, Lucide Icons
- **Backend**: Python, Flask, pyzotero
- **ML**: sentence-transformers, UMAP, scikit-learn
- **APIs**: Zotero, Semantic Scholar, CrossRef

## Data Flow

```
Zotero Library
     ↓
build_map.py (--source api)
  - Fetch items via Zotero API
  - Generate embeddings (sentence-transformers)
  - UMAP dimensionality reduction
  - KMeans clustering
     ↓
papers.json
     ↓
fetch_citations.py
  - Semantic Scholar API
  - Citation counts & references
     ↓
papers.json (enriched)
     ↓
index.html (Plotly.js visualization)
```

## License

MIT
