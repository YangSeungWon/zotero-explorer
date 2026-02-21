# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zotero Explorer is an interactive visualization tool for Zotero research paper libraries. It provides semantic clustering (UMAP + KMeans), citation network visualization, and AI-powered search. The frontend is vanilla HTML/CSS/JS with Plotly.js; the backend is Python (Flask) for API operations.

## Development Commands

### Static mode (no server)
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit with Zotero credentials
python build_map.py --source api          # generate papers.json
python fetch_citations.py                  # enrich with citation data
python -m http.server 8080                 # serve at localhost:8080
```

### With API server (full features)
```bash
docker-compose up -d                       # nginx:20680 + flask:5000
# or run directly:
python api_server.py                       # flask on port 5000
```

### build_map.py options
```bash
python build_map.py --source api           # fetch from Zotero API
python build_map.py --source csv           # use exported CSV
python build_map.py --clusters 10          # set cluster count
python build_map.py --notes-only           # only papers with notes
python build_map.py --embedding openai     # use OpenAI embeddings
```

There are no test suites, linters, or build steps configured.

## Architecture

### Two operating modes
1. **Static**: Just `papers.json` + HTML/JS files — works offline, read-only
2. **Server**: Flask API enables sync, semantic search, ideas management, tag operations

### Frontend (vanilla JS, no framework, no build step)

All JS files are loaded via `<script>` tags in order. There is no module bundler.

**Script load order matters** — dependencies are implicit:
`config.js` → `state.js` → `auth.js` → `api.js` → `data.js` → `render.js` → `theme.js` → `timeline.js` → `paper-item.js` → `detail.js` → `list.js` → `ideas.js` → `mobile.js` → `advanced-search.js` → `paper-search.js` → `ui.js` → `app.js`

**Global state** lives in `js/state.js` — key variables: `allPapers`, `currentFiltered`, `clusterLabels`, `citationLinks`, `selectedPaper`, `bookmarkedPapers`, `currentView`.

**Data flow**: `papers.json` → `loadData()` in `data.js` → populates globals → `render()` in `render.js` draws Plotly chart. Filtering updates `currentFiltered` and re-calls `render()`.

**Views**: Map (2D Plotly scatter), List (HTML table), Timeline (year-based) — switched via `switchView()` in `timeline.js`.

**Entry points**: `index.html` (main app), `triage.html` (bulk tagging), `outline.html` (research notes), `annotation-board.html` (flow board canvas). Each has its own JS file.

**Persistent state**: LocalStorage stores bookmarks, panel widths, view preference, theme, custom cluster labels.

### Backend (Python)

- `api_server.py` — Flask server with REST endpoints for tags, sync, semantic search, ideas, outlines, boards. Uses `X-API-Key` header authentication. Runs background tasks for long operations (cluster sync, full sync, citation fetching).
- `build_map.py` — Offline data pipeline: Zotero API → sentence-transformers embeddings → UMAP → KMeans → `papers.json`
- `zotero_api.py` — Pyzotero wrapper for Zotero API operations
- `fetch_citations.py` — Enriches `papers.json` with Semantic Scholar citation data
- `sync_tags.py` — Two-way tag synchronization with Zotero

### Data format (papers.json)

Single JSON file (~70MB) containing:
- `papers[]` — array of paper objects with: `id`, `zotero_key`, `title`, `authors`, `venue`, `year`, `x`/`y` (UMAP coords), `cluster`, `abstract`, `doi`, `tags`, `notes_html`
- `cluster_centroids` — `{cluster_id: [x, y]}`
- `cluster_labels` — `{cluster_id: "label"}`
- `citation_links` — `[{source, target, type}]`
- `reference_cache` — cached Semantic Scholar data by DOI
- `meta` — build metadata (timestamp, model name, paper count)

### Flow Board (`annotation-board.html` + `js/flow-board.js`)

Free-canvas argument flow builder (Miro/FigJam style). Paper annotation blocks are placed freely on a canvas and connected with directional arrows to design argument flows for introductions or full papers.

**Architecture**: 3-layer rendering stack
1. `#canvasContainer` — overflow:hidden, receives mouse events for pan/zoom
2. `#canvasViewport` — `transform: translate(x,y) scale(z)`, shared by children
3. `#blockLayer` (HTML divs, absolute-positioned) + `#svgLayer` (SVG arrows) inside viewport

**Data storage**: Server-side via `/api/boards` CRUD → `boards.json` (not localStorage)

**Board data structure** (`boards.json`):
```json
{
  "boards": [{
    "id": "uuid",
    "title": "Introduction Flow",
    "blocks": {
      "ann_xxx": {
        "id": "ann_xxx", "x": 100, "y": 200,
        "annotations": [
          {
            "id": "ann_item_1", "quote": "citation text",
            "source": { "text": "Author, 2024", "zoteroKey": "ABC", "zoteroUrl": "zotero://..." },
            "pdf": { "url": "zotero://...", "page": 5, "annotationId": "XYZ123" },
            "paperId": 42, "paperTitle": "Paper Title"
          }
        ],
        "myNote": "overarching synthesis note",
        "caution": "argument guard rail note (optional)",
        "category": "evidence",
        "color": null, "createdAt": 1700000000
      }
    },
    "edges": [
      { "id": "edge_xxx", "from": "ann_xxx", "to": "ann_yyy", "label": "" }
    ],
    "viewport": { "x": 0, "y": 0, "zoom": 1 },
    "created": "2025-01-01T00:00:00",
    "updated": "2025-01-01T00:00:00"
  }]
}
```

**Script load order**: `theme.js` → `auth.js` → `api.js` → `paper-item.js` → `paper-search.js` → `annotation-parser.js` → `flow-board.js`

**Init flow**: `DOMContentLoaded` → `auth.js initAuth()` → `initApp()` (in flow-board.js) → `loadData()` → `fetchBoards()` → `migrateFromLocalStorage()` → `setupEventListeners()` → `initPanZoom()` → `initPaperDetailPanel()` → `selectBoard()`

**Key interactions**:
- Pan: mousedown on empty area → drag
- Zoom: scroll wheel (pointer-centered), buttons, Fit View
- Block drag: mousedown on block → move → edges follow
- Edge create: mousedown on right connector → drag to target block
- Edge/block delete: select → Delete key
- Annotation click: clicking an individual annotation in a block shows that paper in the detail panel (with `.active` highlight)
- Block empty area click / canvas click: closes the detail panel
- Auto-save: 1.5s debounce after any change

**Edge connectors**: Fixed at 30px from the top of each block (not vertically centered), so arrow positions stay stable regardless of block content height.

**Caution field**: Optional per-block argument guard rail. Rendered as an orange warning bar on the canvas block (hidden at mid-zoom). Collapsible section in the edit modal with orange dashed border styling. Included in export as `**⚠️ Caution:** ...`.

**Auto-generated links**: When an annotation has `zoteroKey` but no `zoteroUrl`, the URL is auto-generated via `getZoteroUrl(key)`. Similarly, if a linked paper has `pdf_key` but the annotation has no `pdf.url`, a generic PDF link is generated via `getZoteroPdfUrl(pdfKey)`. Annotation-specific PDF links (with `annotation=` param) use a highlighter icon; generic PDF links use a file-text icon.

**Topological sort**: Uses Kahn's algorithm (in-degree tracking) for consistent block numbering in export. Blocks with no incoming edges are processed first.

**Export**: Copies topologically-sorted Markdown directly to clipboard (no modal). Button shows a check icon for 2 seconds as confirmation.

**Export format** — topologically sorted Markdown with flow map and numbered cross-references:
```markdown
# Board Title

> 3 blocks · 2 connections · Exported 2026. 2. 17.

## Flow Map

\`\`\`
[1] Kim et al., 2024  →  [2] Park et al., 2023
[2] Park et al., 2023  →  [3] Lee, 2025
\`\`\`

## Blocks

### [1] Attention Is All You Need

> "The dominant sequence transduction models are based on complex recurrent..."
> — Kim et al., 2024, p.3

[Zotero](zotero://...) · [PDF p.3](zotero://...)

**Note:** Transformer 아키텍처의 핵심 동기 제시

**⚠️ Caution:** 이 블록에서 빠지면 안 되는 논증 방향...

**[1]** → [2]

---

### [2] BERT: Pre-training of Deep Bidirectional Transformers

> "We introduce a new language representation model called BERT..."
> — Park et al., 2023, p.1

[Zotero](zotero://...) · [PDF p.1](zotero://...)

**Note:** 사전학습 접근법 소개, [1]의 transformer를 양방향으로 확장

[1] → **[2]** · **[2]** → [3]

---

### [3] Scaling Laws for Neural Language Models

> "We study empirical scaling laws for language model performance..."
> — Lee, 2025, p.2

**Note:** 모델 크기와 성능의 관계, [2]에서 제기된 모델 규모 문제의 실증 근거

[2] → **[3]**

---
```

### Annotation Parser (`js/annotation-parser.js`)

Parses Zotero-style annotations from notes and raw pasted text. Two main entry points:
- `parseAnnotationsFromNote(noteText, paper)` — bulk parse from paper notes (curly quotes `\u201C`/`\u201D`)
- `parseRawAnnotation(rawText)` — parse single pasted annotation (supports both curly and straight quotes)

Quote extraction uses greedy regex with lookahead anchor on the link pattern `(?=\s*\()` to correctly handle nested quotes (e.g., `"the 'Best Take' paradigm"` won't truncate at the inner quotes). Fallback to non-greedy patterns when no link follows.

Also handles `[reference]` markers at the end of pasted text to extract the paper title.

**Caution when editing boards.json directly**: The browser auto-saves board state with a 1.5s debounce. If you edit `boards.json` via Python/script while the browser has the flow board open, the browser will overwrite your changes on next interaction. Always close the browser tab before making direct file edits.

### Deployment

Docker Compose runs two services: `nginx:alpine` (port 20680, static files + reverse proxy) and Python API (port 5000 internal). Nginx proxies `/api/*` to Flask.

## Environment Variables

Configured in `.env` (see `.env.example`):
- `ZOTERO_LIBRARY_ID`, `ZOTERO_API_KEY`, `ZOTERO_LIBRARY_TYPE` — required for Zotero access
- `APP_API_KEY` — required for API server authentication
- `S2_API_KEY` — optional, for Semantic Scholar rate limits
