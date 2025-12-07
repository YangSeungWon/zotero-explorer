# Zotero Paper Map

Zotero 라이브러리를 시각화하는 인터랙티브 논문 지도

[English](README.md)

![Paper Map](https://img.shields.io/badge/papers-242-blue) ![Links](https://img.shields.io/badge/citation%20links-420-orange)

## Features

- **클러스터링**: UMAP + KMeans로 유사 논문 그룹화
- **인용 네트워크**: 논문 간 인용 관계 시각화
  - 파란색 선: References (내가 인용한 논문)
  - 주황색 선: Cited by (나를 인용한 논문)
- **필터링**: 연도, venue quality, 태그, 키워드 검색
- **논문 발견**:
  - Classics: 내 논문들이 많이 인용하는 기초 논문
  - New Work: 내 논문들을 인용하는 최신 논문
- **노트 보기**: Zotero 노트 HTML 렌더링

## Quick Start

```bash
# 1. 가상환경 설정
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Zotero에서 CSV 내보내기 (semantel.csv)

# 3. 맵 생성 + citation 데이터 가져오기
python update.py

# 4. 브라우저에서 열기
open index.html
# 또는
python -m http.server 8080
```

## Scripts

| Script | Description |
|--------|-------------|
| `update.py` | 전체 업데이트 (맵 생성 + citation fetch) |
| `build_map.py` | CSV → JSON 변환, 임베딩, 클러스터링 |
| `fetch_citations.py` | Semantic Scholar API로 citation 데이터 |
| `fetch_citations_crossref.py` | CrossRef API로 citation 데이터 (DOI 기반) |
| `find_missing_papers.py` | 라이브러리에 없는 자주 인용된 논문 찾기 |

## Data Flow

```
Zotero Export (CSV)
       ↓
  build_map.py
  - sentence-transformers 임베딩
  - UMAP 차원 축소
  - KMeans 클러스터링
       ↓
  papers.json
       ↓
fetch_citations.py + fetch_citations_crossref.py
  - Semantic Scholar API
  - CrossRef API
       ↓
  papers.json (with citations)
       ↓
   index.html (Plotly.js 시각화)
```

## Options

### build_map.py

```bash
python build_map.py --input my_papers.csv    # 입력 CSV
python build_map.py --clusters 10            # 클러스터 수
python build_map.py --notes-only             # 노트 있는 것만
python build_map.py --embedding openai       # OpenAI 임베딩 사용
```

## Tech Stack

- **Backend**: Python, pandas, scikit-learn, sentence-transformers
- **Frontend**: Plotly.js, vanilla JS
- **APIs**: Semantic Scholar, CrossRef

## Files

```
zotero-viz/
├── index.html              # 메인 시각화 페이지
├── papers.json             # 논문 데이터 + citation links
├── semantel.csv            # Zotero 내보내기 CSV
├── build_map.py            # 맵 빌더
├── fetch_citations.py      # S2 API
├── fetch_citations_crossref.py  # CrossRef API
├── update.py               # 통합 업데이트
└── requirements.txt        # Python dependencies
```
