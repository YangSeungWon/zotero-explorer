# Zotero Paper Map

Zotero 논문 라이브러리를 위한 인터랙티브 시각화 도구. 시맨틱 클러스터링, 인용 네트워크, AI 검색으로 연구 컬렉션을 탐색하세요.

[English](README.md)

## 기능

### 시각화
- **맵 뷰**: 시맨틱 클러스터링 기반 2D 스캐터 플롯 (UMAP + KMeans)
- **타임라인 뷰**: 연도와 클러스터별 논문 배치
- **리스트 뷰**: 정렬 가능한 테이블 형식

### 필터링 & 검색
- 빠른 필터: 베뉴 품질, 태그, 연도 범위, 북마크
- 제목, 저자, 초록 텍스트 검색
- sentence-transformers 임베딩 기반 시맨틱 검색
- 고급 필터 파이프라인 빌더

### 인용 네트워크
- 파란 선: 참고문헌 (내가 인용한 논문)
- 주황 선: 피인용 (나를 인용한 논문)
- 발견 기능:
  - **Classics**: 라이브러리에 없는 자주 인용되는 논문
  - **New Work**: 내 컬렉션을 인용한 최신 논문

### 연구 관리
- 논문 북마크 (Zotero에 "starred" 태그로 동기화)
- 연구 아이디어 생성 및 관리
- 논문-아이디어 연결
- 배치 태그 작업
- Zotero 양방향 동기화 (클러스터 라벨, 커스텀 태그)

## 빠른 시작

### 옵션 1: 정적 (서버 없음)

```bash
# 1. 설정
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 Zotero 인증 정보 입력

# 3. 맵 빌드
python build_map.py --source api

# 4. 인용 데이터 가져오기 (선택)
python fetch_citations.py

# 5. 브라우저에서 열기
open index.html
# 또는 로컬 서버
python -m http.server 8080
```

### 옵션 2: API 서버 (전체 기능)

```bash
# 1. 설정 (위와 동일)

# 2. 서버 시작
docker-compose up -d
# 또는
python api_server.py

# 3. http://localhost:20680 접속
```

## 환경 변수

`.env.example`을 `.env`로 복사하고 설정:

| 변수 | 필수 | 설명 |
|------|------|------|
| `ZOTERO_LIBRARY_ID` | 예 | Zotero 라이브러리 ID |
| `ZOTERO_API_KEY` | 예 | Zotero API 키 ([여기서 발급](https://www.zotero.org/settings/keys)) |
| `ZOTERO_LIBRARY_TYPE` | 예 | `user` 또는 `group` |
| `S2_API_KEY` | 아니오 | Semantic Scholar API 키 (없어도 됨, 있으면 rate limit 높음) |
| `APP_API_KEY` | 서버만 | API 서버 인증 키 |

## 스크립트

| 스크립트 | 설명 |
|----------|------|
| `build_map.py` | 임베딩과 클러스터링으로 papers.json 생성 |
| `fetch_citations.py` | Semantic Scholar에서 인용 데이터 가져오기 |
| `api_server.py` | 전체 동기화 기능을 위한 Flask API 서버 |
| `zotero_api.py` | Zotero API 유틸리티 |

### build_map.py 옵션

```bash
python build_map.py --source api        # Zotero API에서 가져오기 (권장)
python build_map.py --source csv        # 내보낸 CSV 파일 사용
python build_map.py --clusters 10       # 클러스터 수
python build_map.py --notes-only        # 노트 있는 논문만
python build_map.py --embedding openai  # OpenAI 임베딩 사용
```

## 기술 스택

- **프론트엔드**: Vanilla JS, Plotly.js, Lucide Icons
- **백엔드**: Python, Flask, pyzotero
- **ML**: sentence-transformers, UMAP, scikit-learn
- **API**: Zotero, Semantic Scholar, CrossRef

## 데이터 흐름

```
Zotero 라이브러리
     ↓
build_map.py (--source api)
  - Zotero API로 아이템 가져오기
  - 임베딩 생성 (sentence-transformers)
  - UMAP 차원 축소
  - KMeans 클러스터링
     ↓
papers.json
     ↓
fetch_citations.py
  - Semantic Scholar API
  - 인용 수 & 참고문헌
     ↓
papers.json (enriched)
     ↓
index.html (Plotly.js 시각화)
```

## 라이선스

MIT
