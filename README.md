# Zotero Paper Map

Interactive visualization map for your Zotero library

[한국어](README_ko.md)

![Paper Map](https://img.shields.io/badge/papers-242-blue) ![Links](https://img.shields.io/badge/citation%20links-420-orange)

## Features

- **Clustering**: Group similar papers using UMAP + KMeans
- **Citation Network**: Visualize citation relationships
  - Blue lines: References (papers you cite)
  - Orange lines: Cited by (papers citing you)
- **Filtering**: Year, venue quality, tags, keyword search
- **Discovery**:
  - Classics: Foundational papers frequently cited by your library
  - New Work: Recent papers citing your library
- **Notes**: Render Zotero notes with HTML support

## Quick Start

```bash
# 1. Setup virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Export CSV from Zotero (semantel.csv)

# 3. Build map + fetch citation data
python update.py

# 4. Open in browser
open index.html
# or
python -m http.server 8080
```

## Scripts

| Script | Description |
|--------|-------------|
| `update.py` | Full update (build map + fetch citations) |
| `build_map.py` | CSV → JSON conversion, embedding, clustering |
| `fetch_citations.py` | Fetch citation data via Semantic Scholar API |
| `fetch_citations_crossref.py` | Fetch citation data via CrossRef API (DOI-based) |
| `find_missing_papers.py` | Find frequently cited papers not in your library |

## Data Flow

```
Zotero Export (CSV)
       ↓
  build_map.py
  - sentence-transformers embedding
  - UMAP dimensionality reduction
  - KMeans clustering
       ↓
  papers.json
       ↓
fetch_citations.py + fetch_citations_crossref.py
  - Semantic Scholar API
  - CrossRef API
       ↓
  papers.json (with citations)
       ↓
   index.html (Plotly.js visualization)
```

## Options

### build_map.py

```bash
python build_map.py --input my_papers.csv    # Input CSV file
python build_map.py --clusters 10            # Number of clusters
python build_map.py --notes-only             # Papers with notes only
python build_map.py --embedding openai       # Use OpenAI embeddings
```

## Tech Stack

- **Backend**: Python, pandas, scikit-learn, sentence-transformers
- **Frontend**: Plotly.js, vanilla JS
- **APIs**: Semantic Scholar, CrossRef

## Files

```
zotero-viz/
├── index.html              # Main visualization page
├── papers.json             # Paper data + citation links
├── semantel.csv            # Zotero export CSV
├── build_map.py            # Map builder
├── fetch_citations.py      # S2 API
├── fetch_citations_crossref.py  # CrossRef API
├── update.py               # Unified update script
└── requirements.txt        # Python dependencies
```
