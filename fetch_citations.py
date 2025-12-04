#!/usr/bin/env python3
"""
Semantic Scholar API를 사용해 논문의 피인용 수와 인용 관계를 가져옴
"""

import json
import time
import requests
from pathlib import Path

# Semantic Scholar API
BASE_URL = "https://api.semanticscholar.org/graph/v1"
FIELDS = "citationCount,citations.paperId,citations.title,references.paperId,references.title"

def get_paper_by_doi(doi: str) -> dict:
    """DOI로 논문 정보 가져오기"""
    url = f"{BASE_URL}/paper/DOI:{doi}"
    params = {"fields": FIELDS}

    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 404:
            return None
        else:
            print(f"  Error {resp.status_code} for DOI {doi}")
            return None
    except Exception as e:
        print(f"  Exception for DOI {doi}: {e}")
        return None


def get_paper_by_title(title: str) -> dict:
    """제목으로 논문 검색"""
    url = f"{BASE_URL}/paper/search"
    params = {
        "query": title[:200],  # 제목 길이 제한
        "fields": FIELDS,
        "limit": 1
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("data") and len(data["data"]) > 0:
                return data["data"][0]
        return None
    except Exception as e:
        print(f"  Exception for title search: {e}")
        return None


def main():
    # papers.json 로드
    papers_path = Path("papers.json")
    if not papers_path.exists():
        print("papers.json not found")
        return

    with open(papers_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 새 포맷 vs 기존 포맷
    if isinstance(data, dict) and "papers" in data:
        papers = data["papers"]
    else:
        papers = data
        data = {"papers": papers}

    print(f"Processing {len(papers)} papers...")

    # S2 paper ID 매핑 (내 라이브러리 DOI -> S2 ID)
    doi_to_s2id = {}

    # 각 논문에 대해 인용 정보 가져오기
    found = 0
    for i, paper in enumerate(papers):
        doi = paper.get("doi", "").strip()
        title = paper.get("title", "")

        if not doi and not title:
            continue

        print(f"[{i+1}/{len(papers)}] {title[:50]}...")

        # DOI로 먼저 시도
        s2_data = None
        if doi:
            s2_data = get_paper_by_doi(doi)

        # DOI 없거나 못 찾으면 제목으로 검색
        if not s2_data and title:
            s2_data = get_paper_by_title(title)

        if s2_data:
            paper["citation_count"] = s2_data.get("citationCount", 0)
            paper["s2_id"] = s2_data.get("paperId", "")

            # 인용하는 논문들 (이 논문이 인용한 것)
            refs = s2_data.get("references", []) or []
            paper["references"] = [r["paperId"] for r in refs if r and r.get("paperId")]

            # 인용된 논문들 (이 논문을 인용한 것)
            cites = s2_data.get("citations", []) or []
            paper["citations"] = [c["paperId"] for c in cites if c and c.get("paperId")]

            if doi:
                doi_to_s2id[doi] = s2_data.get("paperId", "")

            found += 1
            print(f"  -> Found! Citations: {paper['citation_count']}")
        else:
            paper["citation_count"] = None
            paper["s2_id"] = ""
            paper["references"] = []
            paper["citations"] = []
            print(f"  -> Not found")

        # Rate limiting (100 requests per 5 minutes = 1 per 3 seconds)
        time.sleep(3.5)

    print(f"\nFound {found}/{len(papers)} papers in Semantic Scholar")

    # 내 라이브러리 내 인용 관계 계산
    print("\nCalculating internal citation links...")
    s2id_to_idx = {p.get("s2_id"): p["id"] for p in papers if p.get("s2_id")}

    internal_links = []
    for paper in papers:
        paper_id = paper["id"]
        s2_id = paper.get("s2_id", "")

        # 이 논문이 인용한 것 중 내 라이브러리에 있는 것
        for ref_s2id in paper.get("references", []):
            if ref_s2id in s2id_to_idx:
                target_id = s2id_to_idx[ref_s2id]
                internal_links.append({"source": paper_id, "target": target_id})

        # 이 논문을 인용한 것 중 내 라이브러리에 있는 것
        for cite_s2id in paper.get("citations", []):
            if cite_s2id in s2id_to_idx:
                source_id = s2id_to_idx[cite_s2id]
                # 중복 방지 (source -> target 방향으로 통일)
                link = {"source": source_id, "target": paper_id}
                if link not in internal_links:
                    internal_links.append(link)

    print(f"Found {len(internal_links)} internal citation links")

    # 데이터에 추가
    data["citation_links"] = internal_links

    # 저장
    output_path = Path("papers.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Updated {output_path}")
    print(f"   - Papers with citations: {found}")
    print(f"   - Internal links: {len(internal_links)}")


if __name__ == "__main__":
    main()
