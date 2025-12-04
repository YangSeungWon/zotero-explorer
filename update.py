#!/usr/bin/env python3
"""
Zotero 논문 맵 업데이트 스크립트
1. CSV에서 맵 재생성 (build_map.py)
2. 새 논문의 citation 데이터 가져오기 (fetch_citations.py)
"""

import subprocess
import sys

def run(cmd):
    print(f"\n{'='*60}")
    print(f"▶ {cmd}")
    print('='*60)
    result = subprocess.run(cmd, shell=True)
    return result.returncode == 0

def main():
    # 1. 맵 생성
    if not run("python build_map.py --notes-only --embedding local-large --clusters 0"):
        print("❌ build_map.py 실패")
        sys.exit(1)

    # 2. Citation 데이터 가져오기
    print("\n⏳ Citation 데이터 가져오는 중... (시간 좀 걸려요)")
    if not run("python fetch_citations.py"):
        print("❌ fetch_citations.py 실패")
        sys.exit(1)

    print("\n" + "="*60)
    print("✅ 업데이트 완료!")
    print("   브라우저에서 index.html 열어서 확인하세요")
    print("="*60)

if __name__ == "__main__":
    main()
