#!/usr/bin/env python3
"""
Zotero Paper Map Builder
- CSV에서 논문 데이터 로드
- 텍스트 임베딩 (sentence-transformers 또는 OpenAI)
- 메타데이터 기반 가중치
- 차원 축소 + 클러스터링
- JSON 출력
"""

# GPU 비활성화 (CUDA 호환성 문제 방지)
import os
os.environ['CUDA_VISIBLE_DEVICES'] = ''

import pandas as pd
import numpy as np
import json
import re
import math
import argparse
import glob
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup
from sklearn.preprocessing import StandardScaler
from sklearn.manifold import TSNE
from sklearn.decomposition import PCA
import umap
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.feature_extraction.text import TfidfVectorizer

# ============================================================
# 설정
# ============================================================

# Venue quality 점수 (1-5)
# 1티어 (5): CHI full, UIST, IMWUT, TOCHI, JCMC, IJHCS
# 2티어 (4): CSCW/PACM HCI, DIS, MobileHCI
# 3티어 (3): CHI EA, TEI, 워크샵/포스터
# 기본값: 2.5

VENUE_TIER1 = ["uist", "imwut", "tochi", "trans. comput.-hum. interact",
               "journal of computer-mediated communication", "jcmc",
               "human-computer studies", "ijhcs"]
VENUE_TIER2 = ["cscw", "proc. acm hum.-comput. interact", "acm hum.-comput. interact",
               "dis", "mobilehci", "iui"]
VENUE_TIER3 = ["extended abstract", "chi ea", "tei", "workshop", "poster"]

# Item type 점수
TYPE_SCORE = {
    "journalArticle": 3,
    "conferencePaper": 3,
    "bookSection": 2,
    "preprint": 2,
    "book": 2,
    "webpage": 1,  # 앱/서비스
    "blogPost": 1,
}

CURRENT_YEAR = 2025

# ============================================================
# 유틸리티 함수
# ============================================================

def extract_text_from_html(html_content: str) -> str:
    """HTML에서 텍스트만 추출"""
    if pd.isna(html_content) or not html_content:
        return ""
    soup = BeautifulSoup(html_content, "html.parser")
    return soup.get_text(separator="\n", strip=True)


def get_venue_score(row) -> float:
    """venue quality 점수 계산"""
    # Publication Title, Conference Name, Series 등에서 검색
    text_to_check = " ".join([
        str(row.get("Publication Title", "")),
        str(row.get("Conference Name", "")),
        str(row.get("Series", "")),
    ]).lower()

    # 3티어 먼저 체크 (CHI EA, workshop 등)
    for keyword in VENUE_TIER3:
        if keyword in text_to_check:
            return 3.0

    # 1티어 체크
    for keyword in VENUE_TIER1:
        if keyword in text_to_check:
            return 5.0

    # 2티어 체크
    for keyword in VENUE_TIER2:
        if keyword in text_to_check:
            return 4.0

    # CHI는 EA가 아니면 1티어 (위에서 EA 이미 걸러짐)
    # "human factors in computing systems" 또는 "sigchi"로 정확히 매칭
    if "human factors in computing systems" in text_to_check or "sigchi" in text_to_check:
        return 5.0

    return 2.5  # 기본값


def get_type_score(item_type: str) -> float:
    """item type 점수"""
    if pd.isna(item_type):
        return 2
    return TYPE_SCORE.get(item_type, 2)


def parse_year(year_val) -> int:
    """연도 파싱"""
    try:
        year = int(float(year_val))
        if 1900 < year <= CURRENT_YEAR:
            return year
    except:
        pass
    return None


def build_text_for_embedding(row) -> str:
    """임베딩용 텍스트 생성 (Title + Abstract + Notes)"""
    parts = []

    # Title
    title = row.get("Title", "")
    if pd.notna(title) and title and str(title).lower() != "nan":
        parts.append(f"Title: {title}")

    # Abstract
    abstract = row.get("Abstract Note", "")
    if pd.notna(abstract) and abstract and str(abstract).lower() != "nan":
        parts.append(f"Abstract: {abstract}")

    # Notes (HTML -> text)
    notes = row.get("Notes", "")
    if pd.notna(notes) and notes and str(notes).lower() != "nan":
        notes_text = extract_text_from_html(notes)
        if notes_text:
            parts.append(f"Notes: {notes_text}")

    # 빈 텍스트 방지
    if not parts:
        title = row.get("Title", "Untitled")
        return f"Title: {title if pd.notna(title) else 'Untitled'}"

    return "\n\n".join(parts)


# ============================================================
# 임베딩 함수
# ============================================================

def embed_with_sentence_transformers(texts: list, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2") -> np.ndarray:
    """sentence-transformers로 임베딩"""
    from sentence_transformers import SentenceTransformer

    print(f"Loading model: {model_name}")
    model = SentenceTransformer(model_name)

    print(f"Embedding {len(texts)} texts...")
    embeddings = model.encode(texts, show_progress_bar=True)
    return np.array(embeddings)


def embed_with_openai(texts: list, model: str = "text-embedding-3-small") -> np.ndarray:
    """OpenAI API로 임베딩"""
    import openai

    print(f"Embedding {len(texts)} texts with OpenAI {model}...")
    embeddings = []

    # 배치 처리 (API 제한 고려)
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        # 텍스트 길이 제한 (8000자)
        batch = [t[:8000] if t else " " for t in batch]

        resp = openai.embeddings.create(model=model, input=batch)
        for item in resp.data:
            embeddings.append(item.embedding)

        print(f"  Processed {min(i+batch_size, len(texts))}/{len(texts)}")

    return np.array(embeddings)


# ============================================================
# 메인 로직
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Build paper map from Zotero CSV")
    parser.add_argument("--output", default="papers.json", help="Output JSON file")
    parser.add_argument("--embedding", choices=["local", "local-large", "openai"], default="local",
                        help="Embedding: local (multilingual-MiniLM), local-large (multilingual-mpnet), openai")
    parser.add_argument("--clusters", type=int, default=0,
                        help="Number of clusters (0 = auto-detect optimal k)")
    parser.add_argument("--dim-reduction", choices=["tsne", "pca", "umap"], default="umap",
                        help="Dimensionality reduction method (umap recommended)")
    parser.add_argument("--min-dist", type=float, default=0.3,
                        help="UMAP min_dist: 0.1(tight) ~ 0.5(spread)")
    parser.add_argument("--all", action="store_true",
                        help="Include all papers (default: notes-only)")
    parser.add_argument("--notes-only", action="store_true", default=True,
                        help="Only include items with notes")
    args = parser.parse_args()

    # 1. CSV 로드 (현재 디렉토리의 모든 CSV 합치기)
    csv_files = glob.glob("*.csv")
    if not csv_files:
        print("❌ No CSV files found in current directory")
        return

    print(f"\n[1/5] Loading {len(csv_files)} CSV file(s)...")
    dfs = []
    for csv_file in csv_files:
        try:
            csv_df = pd.read_csv(csv_file)
            print(f"  - {csv_file}: {len(csv_df)} items")
            dfs.append(csv_df)
        except Exception as e:
            print(f"  - {csv_file}: Error - {e}")

    df = pd.concat(dfs, ignore_index=True)
    # 중복 제거 (Title + DOI 기준)
    before_dedup = len(df)
    df = df.drop_duplicates(subset=["Title", "DOI"], keep="first")
    if len(df) < before_dedup:
        print(f"  Removed {before_dedup - len(df)} duplicates")
    print(f"  Total: {len(df)} items")

    # 노트 있는 것만 필터링 (기본값)
    if not args.all:
        df = df[df["Notes"].notna() & (df["Notes"].str.len() > 50)]
        df = df.reset_index(drop=True)
        print(f"  Filtered to {len(df)} items with notes")

    # 2. 메타데이터 처리
    print("\n[2/5] Processing metadata...")
    df["year_clean"] = df["Publication Year"].apply(parse_year)
    df["age"] = df["year_clean"].apply(lambda y: CURRENT_YEAR - y if y else None)
    median_age = df["age"].median()
    df["age"] = df["age"].fillna(median_age)

    df["venue_quality"] = df.apply(get_venue_score, axis=1)
    df["type_score"] = df["Item Type"].apply(get_type_score)

    # is_paper 플래그 (논문 vs 앱/서비스)
    df["is_paper"] = df["Item Type"].isin(["conferencePaper", "journalArticle", "bookSection", "preprint", "book"])

    print(f"  Papers: {df['is_paper'].sum()}, Apps/Services: {(~df['is_paper']).sum()}")

    # 3. 텍스트 임베딩
    print("\n[3/5] Building embeddings...")
    texts = [build_text_for_embedding(row) for _, row in df.iterrows()]

    if args.embedding == "local":
        embeddings = embed_with_sentence_transformers(texts, "paraphrase-multilingual-MiniLM-L12-v2")
    elif args.embedding == "local-large":
        embeddings = embed_with_sentence_transformers(texts, "paraphrase-multilingual-mpnet-base-v2")
    else:
        embeddings = embed_with_openai(texts)

    print(f"  Embedding shape: {embeddings.shape}")

    # 4. 메타데이터 feature 결합
    print("\n[4/5] Combining features and reducing dimensions...")
    meta_features = df[["venue_quality", "type_score", "age"]].values

    # 스케일링
    scaler = StandardScaler()
    meta_scaled = scaler.fit_transform(meta_features)

    # 가중치 적용 (venue, type, age)
    weights = np.array([1.5, 1.0, 0.5])
    meta_scaled = meta_scaled * weights

    # 임베딩 + 메타데이터 결합
    # 임베딩도 스케일링
    emb_scaler = StandardScaler()
    emb_scaled = emb_scaler.fit_transform(embeddings)

    # 메타데이터 비중 조절 (임베딩 대비 0.3 정도)
    combined = np.hstack([emb_scaled, meta_scaled * 0.3])

    # 차원 축소
    if args.dim_reduction == "umap":
        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=15,
            min_dist=args.min_dist,
            metric='cosine',
            random_state=42
        )
        coords = reducer.fit_transform(combined)
        print(f"  UMAP: min_dist={args.min_dist}")
    elif args.dim_reduction == "tsne":
        # t-SNE는 고차원에서 바로 하면 느리므로 PCA로 먼저 축소
        if combined.shape[1] > 50:
            pca = PCA(n_components=50, random_state=42)
            combined_reduced = pca.fit_transform(combined)
        else:
            combined_reduced = combined

        tsne = TSNE(n_components=2, random_state=42, perplexity=min(30, len(df)-1))
        coords = tsne.fit_transform(combined_reduced)
    else:
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(combined)

    df["x"] = coords[:, 0]
    df["y"] = coords[:, 1]

    # 5. 클러스터링
    n_clusters = args.clusters
    if n_clusters == 0:
        # 최적 k 탐색 (Silhouette score)
        print("\n[5/5] Finding optimal number of clusters...")
        k_range = range(5, min(20, len(df) // 10))
        best_k = 10
        best_score = -1
        scores = []

        for k in k_range:
            kmeans_test = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = kmeans_test.fit_predict(combined)
            score = silhouette_score(combined, labels)
            scores.append((k, score))
            print(f"  k={k}: silhouette={score:.3f}")
            if score > best_score:
                best_score = score
                best_k = k

        n_clusters = best_k
        print(f"\n  → Best k={best_k} (silhouette={best_score:.3f})")
    else:
        print(f"\n[5/5] Clustering into {n_clusters} clusters...")

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    df["cluster"] = kmeans.fit_predict(combined)

    # 6. 클러스터 라벨 생성 (TF-IDF 키워드)
    print("\nGenerating cluster labels...")
    cluster_texts = {}
    for idx, row in df.iterrows():
        c = int(row["cluster"])
        title = row.get('Title', '') if pd.notna(row.get('Title', '')) else ''
        abstract = row.get('Abstract Note', '') if pd.notna(row.get('Abstract Note', '')) else ''
        notes = row.get('Notes', '') if pd.notna(row.get('Notes', '')) else ''
        notes_text = extract_text_from_html(notes) if notes else ''
        text = f"{title} {abstract} {notes_text}"
        cluster_texts[c] = cluster_texts.get(c, "") + " " + str(text)

    corpus = [cluster_texts.get(i, "") for i in range(n_clusters)]

    # 다국어 불용어 (영어 + 한국어)
    multilingual_stop_words = [
        # English
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
        'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'they', 'their', 'them',
        'can', 'also', 'more', 'how', 'what', 'which', 'who', 'when', 'where', 'why',
        'using', 'use', 'used', 'based', 'through', 'between', 'into', 'such', 'than',
        'study', 'research', 'paper', 'results', 'findings', 'analysis', 'data', 'method',
        # Korean
        '및', '등', '를', '을', '이', '가', '은', '는', '에', '의', '로', '으로', '와', '과',
        '하는', '있는', '되는', '한', '된', '수', '것', '대한', '통해', '위해', '대해',
    ]

    tfidf_vec = TfidfVectorizer(
        max_features=500,
        stop_words=multilingual_stop_words,
        ngram_range=(1, 2),
        min_df=1,
        token_pattern=r'(?u)\b[가-힣a-zA-Z]{2,}\b'  # 한글/영어 2글자 이상
    )
    tfidf_matrix = tfidf_vec.fit_transform(corpus)
    feature_names = tfidf_vec.get_feature_names_out()

    cluster_labels = {}
    for i in range(n_clusters):
        scores = tfidf_matrix[i].toarray().flatten()
        top_idx = scores.argsort()[-3:][::-1]  # 상위 3개 키워드
        keywords = [feature_names[j] for j in top_idx]
        cluster_labels[i] = ", ".join(keywords)
        print(f"  Cluster {i}: {cluster_labels[i]}")

    # 6.5. 클러스터 중심점 계산 (2D 좌표 기준)
    print("\nCalculating cluster centroids...")
    cluster_centroids = {}
    for i in range(n_clusters):
        cluster_points = df[df["cluster"] == i][["x", "y"]].values
        if len(cluster_points) > 0:
            centroid_x = float(np.mean(cluster_points[:, 0]))
            centroid_y = float(np.mean(cluster_points[:, 1]))
            cluster_centroids[i] = {"x": centroid_x, "y": centroid_y}
            print(f"  Cluster {i}: ({centroid_x:.2f}, {centroid_y:.2f})")

    # 7. JSON 출력
    print(f"\nWriting {args.output}...")

    # 기존 papers.json에서 citation 데이터 로드 (있으면)
    existing_citation_data = {}
    existing_citation_links = []
    try:
        with open(args.output, "r", encoding="utf-8") as f:
            existing = json.load(f)
            existing_papers = existing.get("papers", existing)
            existing_citation_links = existing.get("citation_links", [])
            for p in existing_papers:
                if p.get("doi"):
                    existing_citation_data[p["doi"]] = {
                        "citation_count": p.get("citation_count"),
                        "s2_id": p.get("s2_id", ""),
                        "references": p.get("references", []),
                        "citations": p.get("citations", []),
                    }
        print(f"  Loaded citation data for {len(existing_citation_data)} papers")
    except:
        pass

    records = []
    for idx, row in df.iterrows():
        rec = {
            "id": int(idx),
            "title": str(row.get("Title", "") or ""),
            "year": int(row["year_clean"]) if pd.notna(row["year_clean"]) else None,
            "authors": str(row.get("Author", "") or ""),
            "venue": str(row.get("Publication Title", "") or ""),
            "item_type": str(row.get("Item Type", "") or ""),
            "is_paper": bool(row["is_paper"]),
            "venue_quality": float(row["venue_quality"]),
            "x": float(row["x"]),
            "y": float(row["y"]),
            "cluster": int(row["cluster"]),
            "cluster_label": cluster_labels.get(int(row["cluster"]), ""),
            "url": str(row.get("Url", "") or ""),
            "doi": str(row.get("DOI", "") or ""),
            "abstract": str(row.get("Abstract Note", "") or "")[:500],  # 길이 제한
            "tags": str(row.get("Manual Tags", "") or ""),
            "has_notes": bool(pd.notna(row.get("Notes")) and len(str(row.get("Notes", ""))) > 50),
            "notes_html": str(row.get("Notes", ""))[:5000] if pd.notna(row.get("Notes")) else "",  # HTML 보존
            "notes": extract_text_from_html(row.get("Notes", ""))[:2000] if pd.notna(row.get("Notes")) else "",
        }

        # 기존 citation 데이터 복원
        doi = rec.get("doi", "")
        if doi and doi in existing_citation_data:
            cdata = existing_citation_data[doi]
            rec["citation_count"] = cdata["citation_count"]
            rec["s2_id"] = cdata["s2_id"]
            rec["references"] = cdata["references"]
            rec["citations"] = cdata["citations"]

        records.append(rec)

    # CSV 파일 수정 시간 (가장 최근 파일 기준)
    csv_mtime = max(os.path.getmtime(f) for f in csv_files)
    csv_updated = datetime.fromtimestamp(csv_mtime).strftime("%Y-%m-%d %H:%M")

    # 출력 데이터에 클러스터 중심점 포함
    output_data = {
        "papers": records,
        "cluster_centroids": cluster_centroids,
        "cluster_labels": cluster_labels,
        "citation_links": existing_citation_links,  # 기존 citation links 보존
        "meta": {
            "csv_updated": csv_updated,
            "map_built": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "total_papers": sum(1 for r in records if r['is_paper']),
            "total_apps": sum(1 for r in records if not r['is_paper']),
            "clusters": n_clusters
        }
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Done! Generated {args.output} with {len(records)} items")
    print(f"   - Papers: {sum(1 for r in records if r['is_paper'])}")
    print(f"   - Apps/Services: {sum(1 for r in records if not r['is_paper'])}")
    print(f"   - Clusters: {n_clusters}")


if __name__ == "__main__":
    main()
