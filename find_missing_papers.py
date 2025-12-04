#!/usr/bin/env python3
"""
내 라이브러리에서 자주 인용하지만 아직 없는 논문들 찾기
"""

import json
import time
import requests
from collections import Counter
from pathlib import Path

BASE_URL = "https://api.semanticscholar.org/graph/v1"


def get_paper_details(paper_id: str) -> dict:
    """S2 ID로 논문 상세 정보 가져오기"""
    url = f"{BASE_URL}/paper/{paper_id}"
    params = {"fields": "title,authors,year,citationCount,venue,url"}

    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 429:
            print("  Rate limited, waiting...")
            time.sleep(60)
            return get_paper_details(paper_id)
    except Exception as e:
        print(f"  Error: {e}")
    return None


def main():
    # papers.json 로드
    with open("papers.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    papers = data.get("papers", data)

    # 내 라이브러리에 있는 S2 ID들
    my_s2_ids = set(p.get("s2_id", "") for p in papers if p.get("s2_id"))
    print(f"내 라이브러리: {len(my_s2_ids)}개 논문 (S2 ID 있음)")

    # 모든 references 수집 (내 논문들이 인용한 것들)
    all_refs = []
    for p in papers:
        refs = p.get("references", [])
        all_refs.extend(refs)

    print(f"총 {len(all_refs)}개 references 발견")

    # 내 라이브러리에 없는 것들만 필터링
    missing_refs = [r for r in all_refs if r not in my_s2_ids]
    print(f"라이브러리에 없는 것: {len(missing_refs)}개")

    # 가장 많이 인용된 순으로 정렬
    ref_counts = Counter(missing_refs)
    top_missing = ref_counts.most_common(30)

    print(f"\n{'='*60}")
    print("📚 가져와야 할 논문 TOP 30 (내 라이브러리에서 자주 인용)")
    print(f"{'='*60}\n")

    results = []
    for i, (s2_id, count) in enumerate(top_missing, 1):
        print(f"[{i}/30] Fetching {s2_id[:20]}... (cited by {count} papers)")

        details = get_paper_details(s2_id)
        if details:
            title = details.get("title", "Unknown")
            year = details.get("year", "N/A")
            citations = details.get("citationCount", 0)
            venue = details.get("venue", "")
            url = details.get("url", "")
            authors = details.get("authors", [])
            first_author = authors[0]["name"] if authors else "Unknown"

            result = {
                "rank": i,
                "cited_by_my_papers": count,
                "title": title,
                "first_author": first_author,
                "year": year,
                "venue": venue,
                "global_citations": citations,
                "url": url,
                "s2_id": s2_id
            }
            results.append(result)

            print(f"   {title[:60]}...")
            print(f"   {first_author} ({year}) - Cited: {citations}")
            print()

        time.sleep(1)  # Rate limiting

    # 결과 저장
    output_path = Path("missing_papers.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 결과 저장: {output_path}")

    # 요약 출력
    print(f"\n{'='*60}")
    print("📋 요약: 가져올 논문 TOP 10")
    print(f"{'='*60}")
    for r in results[:10]:
        print(f"{r['rank']:2}. [{r['cited_by_my_papers']}회 인용] {r['title'][:50]}...")
        print(f"    {r['first_author']} ({r['year']}) | Global: {r['global_citations']} citations")


if __name__ == "__main__":
    main()
