#!/usr/bin/env python3
"""
Zotero Explorer - Map Builder
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
import collections
from scipy.optimize import linear_sum_assignment
import glob
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup
from sklearn.preprocessing import StandardScaler, normalize
from sklearn.manifold import TSNE
from sklearn.decomposition import PCA
import umap
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import hdbscan
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer

# ============================================================
# 설정
# ============================================================

# Venue quality 점수 (1-5)
# 1티어 (5): CHI, UIST, IMWUT/UbiComp, TOCHI, JCMC, IJHCS, CVPR
# 2티어 (4): CSCW/PACM HCI, DIS, MobileHCI, IUI, VR/ISMAR, NordiCHI, CHI Play, C&C
# 3티어 (3): CHI EA, TEI, 워크샵/포스터
# 기본값: 2.5

VENUE_TIER1 = [
    # CHI main conference
    "chi conference on human factors",
    "sigchi conference on human factors",
    "annual acm conference on human factors",
    # UIST
    "user interface software and technology",
    "uist",
    # IMWUT / UbiComp
    "interact. mob. wearable ubiquitous",
    "imwut",
    "ubiquitous computing",
    "ubicomp",
    # Journals
    "trans. comput.-hum. interact",
    "tochi",
    "journal of computer-mediated communication",
    "jcmc",
    "human-computer studies",
    "ijhcs",
    # CV top venue
    "cvpr",
    "computer vision and pattern recognition",
]
VENUE_TIER2 = [
    # CSCW / PACM HCI
    "cscw",
    "computer supported cooperative work",
    "proc. acm hum.-comput. interact",
    "acm hum.-comput. interact",
    # DIS
    "designing interactive systems",
    # MobileHCI
    "mobilehci",
    "mobile devices and services",
    "human-computer interaction with mobile",
    # IUI
    "intelligent user interface",
    "iui",
    # VR/AR
    "virtual reality software and technology",
    "vrst",
    "mixed and augmented reality",
    "ismar",
    # Others
    "nordic human-computer",
    "nordichi",
    "chi play",
    "computer-human interaction in play",
    "creativity and cognition",
    "mobile and ubiquitous multimedia",
]
VENUE_TIER3 = ["extended abstract", "chi ea", "tei", "tangible, embedded", "workshop", "poster", "adjunct", "companion"]

# ACM 컨퍼런스 약자 매핑 (패턴 -> 약자)
# 순서 중요: 더 구체적인 패턴(EA, Companion)이 먼저 와야 함
ACM_VENUE_ABBREV = {
    # Extended Abstracts / Companion (must come first!)
    "extended abstracts.*human factors": "CHI EA",
    "chi.*extended abstracts": "CHI EA",
    "extended abstracts.*chi": "CHI EA",
    "adjunct.*pervasive.*ubiquitous": "UbiComp Adjunct",
    "adjunct.*ubicomp": "UbiComp Adjunct",
    "adjunct.*user interface software": "UIST Adjunct",
    "adjunct.*uist": "UIST Adjunct",
    "companion.*user interface software": "UIST Companion",
    "companion.*computer-human interaction in play": "CHI PLAY Companion",
    "companion.*computer supported cooperative": "CSCW Companion",
    "companion.*designing interactive systems": "DIS Companion",

    # Top HCI venues
    "human factors in computing systems": "CHI",
    "user interface software and technology": "UIST",
    "ubiquitous computing": "UbiComp",
    "interact. mob. wearable ubiquitous": "IMWUT",
    "computer supported cooperative work": "CSCW",
    "designing interactive systems": "DIS",
    "tangible.* embedded.* embodied": "TEI",
    "intelligent user interface": "IUI",
    "multimodal interact": "ICMI",
    "human-robot interaction": "HRI",
    "creativity and cognition": "C&C",
    "mobile.* human.* computer.* interact": "MobileHCI",
    "mobile devices and services": "MobileHCI",
    "virtual reality software and technology": "VRST",
    "spatial user interaction": "SUI",
    "symposium on applied perception": "SAP",
    "eye tracking research": "ETRA",
    "engineering interactive computing": "EICS",
    "computers and accessibility": "ASSETS",
    "recommender systems": "RecSys",
    "fairness.* accountability.* transparency": "FAccT",
    "augmented humans": "AHs",
    "australian.*human.*computer": "OzCHI",
    "nordic.*human.*computer": "NordiCHI",
    "computer.*human.*interaction.*play": "CHI PLAY",
    r"proc\.?\s*acm.*hum.*comput.*interact": "PACM HCI",
    r"acm.*hum.*comput.*interact": "PACM HCI",
    "human information interaction.* retrieval": "CHIIR",
    "conversational user interf": "CUI",
    "interaction design and children": "IDC",
    "interactive media experience": "IMX",
    r"acm trans.*inf.*syst": "TOIS",
    r"acm trans.*comput.*hum.*interact": "TOCHI",
    r"trans.*comput.*hum.*interact": "TOCHI",
    r"acm trans.*graph": "TOG",
    "user modeling.*user.*adapted": "UMUAI",
    "international journal.*human.*computer": "IJHCS",
    "journal of computer-mediated": "JCMC",
    "human.*computer interaction$": "HCI Journal",
    "communications of the acm": "CACM",
    "pervasive.* mobile.* computing": "PMC",

    # Graphics & Games
    "computer graphics and interactive techniques": "SIGGRAPH",
    "interactive 3d graphics": "I3D",
    "non-photorealistic animation": "NPAR",
    "computer animation": "SCA",
    "motion.* games": "MIG",
    "high performance graphics": "HPG",

    # Systems & Architecture
    "operating systems principles": "SOSP",
    "architectural support for programming": "ASPLOS",
    "computer architecture": "ISCA",
    "microarchitecture": "MICRO",
    "mobile computing and networking": "MobiCom",
    "mobile systems.* applications": "MobiSys",
    "mobile ad hoc networking": "MobiHoc",
    "embedded network.* sensor": "SenSys",
    "high performance distributed": "HPDC",
    "supercomputing": "SC",
    "international conference on supercomputing": "ICS",
    "parallel.* distributed.* simulation": "PADS",
    "autonomic computing": "ICAC",

    # Networking
    "sigcomm": "SIGCOMM",
    "data communication": "SIGCOMM",
    "internet measurement": "IMC",
    "emerging networking experiments": "CoNEXT",
    "network and operating systems support for digital": "NOSSDAV",

    # Databases & IR
    "management of data": "SIGMOD",
    "principles of database": "PODS",
    "information and knowledge management": "CIKM",
    "research.* development.* information retrieval": "SIGIR",
    "web search and data mining": "WSDM",
    "knowledge discovery and data mining": "KDD",
    "digital libraries": "JCDL",
    "hypertext and hypermedia": "HT",
    "document engineering": "DocEng",

    # Programming Languages & Software Engineering
    "programming language design": "PLDI",
    "principles of programming languages": "POPL",
    "functional programming": "ICFP",
    "object.* oriented programming": "OOPSLA",
    "software engineering": "ICSE",
    "foundations of software engineering": "FSE",
    "automated software engineering": "ASE",
    "software testing and analysis": "ISSTA",
    "code generation and optimization": "CGO",
    "certified programs and proofs": "CPP",
    "generative programming": "GPCE",

    # Theory & Algorithms
    "theory of computing": "STOC",
    "discrete algorithms": "SODA",
    "principles of distributed computing": "PODC",
    "parallel algorithms and architectures": "SPAA",
    "parallel.* practice of parallel": "PPoPP",
    "genetic and evolutionary computation": "GECCO",

    # Security & Privacy
    "computer and communications security": "CCS",
    "information.* computer.* communications security": "ASIACCS",
    "data and application security": "CODASPY",
    "access control models": "SACMAT",
    "security.* privacy.* wireless": "WiSec",
    "information hiding.* multimedia security": "IH&MMSec",

    # Design Automation & VLSI
    "design automation conference": "DAC",
    "computer-aided design": "ICCAD",
    "physical design": "ISPD",
    "low power electronics": "ISLPED",
    "field.* programmable gate arrays": "FPGA",
    "great lakes.* vlsi": "GLSVLSI",
    "integrated circuits and system design": "SBCCI",

    # Multimedia
    "multimedia conference": "MM",
    "multimedia retrieval": "ICMR",

    # Web
    "world wide web": "WWW",
    "the web conference": "WWW",
    "web science": "WebSci",
    "3d.* web": "Web3D",

    # Education
    "computer science education": "SIGCSE",
    "innovation and technology in computer science education": "ITiCSE",
    "computing education research": "ICER",
    "information technology education": "SIGITE",

    # Other
    "economics and computation": "EC",
    "measurement and modeling": "SIGMETRICS",
    "performance engineering": "ICPE",
    "group.* work": "GROUP",
    "distributed event": "DEBS",
    "middleware": "Middleware",
    "computing frontiers": "CF",
    "bioinformatics.* computational biology": "BCB",
    "geographic information": "SIGSPATIAL",
    "collective intelligence": "CI",
    "knowledge capture": "K-CAP",
    "applied computing": "SAC",
    "cyber.* physical": "CPSWeek",
    "energy.* efficient.* built": "BuildSys",

    # IEEE Conferences
    "ieee.*virtual reality": "IEEE VR",
    "ieee.*mixed.*augmented reality": "IEEE ISMAR",
    "ieee.*visualization": "IEEE VIS",
    "ieee.*big data": "IEEE Big Data",
    "ieee.*intelligent vehicles": "IEEE IV",
    "ieee.*robot.*automation": "IEEE ICRA",
    "ieee.*intelligent robots": "IEEE IROS",
    "ieee.*pervasive computing": "IEEE PerCom",
    "ieee.*affective computing": "IEEE ACII",
    "ieee.*haptics": "IEEE Haptics",
}

def get_venue_abbrev(venue: str) -> str:
    """긴 venue 이름을 약자로 변환"""
    if not venue:
        return ""

    venue_lower = venue.lower()

    # 연도 추출 (있으면)
    year_match = re.search(r'\b(19|20)\d{2}\b', venue)
    year = year_match.group(0) if year_match else ""

    # 패턴 매칭
    for pattern, abbrev in ACM_VENUE_ABBREV.items():
        if re.search(pattern, venue_lower):
            return f"{abbrev} {year}".strip() if year else abbrev

    # 매칭 안 되면 원본 (너무 길면 자름)
    if len(venue) > 50:
        # "Proceedings of the 20th" 같은 패턴 제거
        venue = re.sub(r'^proceedings of (the )?(\d+(st|nd|rd|th)\s+)?(annual\s+)?(acm\s+)?(international\s+)?', '', venue, flags=re.IGNORECASE)
        if len(venue) > 50:
            venue = venue[:47] + "..."
    return venue

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

CURRENT_YEAR = datetime.now().year

# ============================================================
# 유틸리티 함수
# ============================================================

def extract_text_from_html(html_content: str) -> str:
    """HTML에서 텍스트만 추출 (문단 구분 보존)"""
    import re
    if pd.isna(html_content) or not html_content:
        return ""

    # 블록 요소 뒤에만 줄바꿈 추가 (인라인 요소는 유지)
    html = str(html_content)

    # 테이블 셀 내부의 <p> 태그 제거 (셀끼리 탭으로 구분)
    html = re.sub(r'<t[dh][^>]*>\s*<p>', '<td>', html, flags=re.IGNORECASE)
    html = re.sub(r'</p>\s*</t[dh]>', '</td>', html, flags=re.IGNORECASE)
    # 테이블 행은 줄바꿈, 셀은 탭으로 구분
    html = re.sub(r'</t[dh]>\s*<t[dh][^>]*>', '\t', html, flags=re.IGNORECASE)
    html = re.sub(r'</tr>', '</tr>{LINE}', html, flags=re.IGNORECASE)
    # 테이블 전체는 하나의 문단으로
    html = re.sub(r'<table[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</table>', '{PARA}', html, flags=re.IGNORECASE)

    # 블록 요소 닫는 태그 뒤에 마커 추가
    # </p> 뒤에 <ul>, <ol>이 오면 붙이기 (같은 섹션)
    html = re.sub(r'</p>\s*<(ul|ol)', r'</p>{LINE}<\1', html, flags=re.IGNORECASE)

    # 일반 </p>, </div> 등은 문단 분리
    block_para_tags = ['p', 'div', 'tr', 'blockquote']
    for tag in block_para_tags:
        # 이미 {LINE}이 붙은 경우 제외
        html = re.sub(f'</{tag}>(?!{{)', f'</{tag}>{{PARA}}', html, flags=re.IGNORECASE)

    # 헤더는 다음 내용과 연결 (단일 줄바꿈)
    for i in range(1, 7):
        html = re.sub(f'</h{i}>', f'</h{i}>{{LINE}}', html, flags=re.IGNORECASE)

    # 리스트 항목은 단일 줄바꿈 (문단 분리 아님)
    html = re.sub(r'</li>', '</li>{LINE}', html, flags=re.IGNORECASE)

    # <br>은 단일 줄바꿈, <hr>은 문단 분리 (섹션 구분)
    html = re.sub(r'<br\s*/?>', '{LINE}', html, flags=re.IGNORECASE)
    html = re.sub(r'<hr\s*/?>', '{PARA}', html, flags=re.IGNORECASE)

    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator=" ", strip=True)

    # 마커를 실제 줄바꿈으로 변환
    text = text.replace('{PARA}', '\n\n')
    text = text.replace('{LINE}', '\n')

    # 연속된 줄바꿈/공백 정리
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n +', '\n', text)

    return text.strip()


def get_venue_score(row) -> float:
    """venue quality 점수 계산"""
    # Publication Title, Proceedings Title, Conference Name, Series 등에서 검색
    text_to_check = " ".join([
        str(row.get("Publication Title", "")),
        str(row.get("Proceedings Title", "")),
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


def is_review_paper(title: str, abstract: str) -> bool:
    """리뷰/서베이 논문인지 자동 감지

    제목에서 명확한 리뷰/서베이 패턴을 찾아서 판단
    abstract만으로는 false positive가 많아서 제목 중심으로 판단
    """
    if not title:
        return False

    title_lower = title.lower()

    # 제목에서 명확한 리뷰 패턴 (높은 신뢰도)
    title_patterns = [
        r'\ba\s+review\b',              # "a review"
        r'\breview\s+of\b',             # "review of"
        r'\bliterature\s+review\b',     # "literature review"
        r'\bsystematic\s+review\b',     # "systematic review"
        r'\bscoping\s+review\b',        # "scoping review"
        r'\bmeta[\-\s]?analysis\b',     # "meta-analysis"
        r'\bsurvey\s+of\b',             # "survey of"
        r'\ba\s+survey\b',              # "a survey"
        r'\bstate[\-\s]of[\-\s]the[\-\s]art\b',  # "state-of-the-art"
        r':\s*a\s+review\b',            # ": a review" (부제)
        r':\s*review\s+and\b',          # ": review and..." (부제)
    ]

    for pattern in title_patterns:
        if re.search(pattern, title_lower):
            return True

    return False


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


def chunk_text(text: str, max_chars: int = 1500) -> list:
    """긴 텍스트를 청크로 분할 (대략 512 토큰 ≈ 1500자)"""
    if not text or len(text) <= max_chars:
        return [text] if text else []

    chunks = []
    # 문단/문장 단위로 분할 시도
    paragraphs = text.split('\n\n')
    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) <= max_chars:
            current_chunk += ("\n\n" if current_chunk else "") + para
        else:
            if current_chunk:
                chunks.append(current_chunk)
            # 문단이 너무 길면 강제 분할
            if len(para) > max_chars:
                for i in range(0, len(para), max_chars):
                    chunks.append(para[i:i+max_chars])
                current_chunk = ""
            else:
                current_chunk = para

    if current_chunk:
        chunks.append(current_chunk)

    return chunks if chunks else [text[:max_chars]]


def embed_with_weighted_sections(df: pd.DataFrame, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2",
                                  title_weight: float = 0.3, abstract_weight: float = 0.4, notes_weight: float = 0.3) -> np.ndarray:
    """섹션별 가중치 + 청킹으로 임베딩 (단일 벡터 버전 - legacy)"""
    from sentence_transformers import SentenceTransformer

    print(f"Loading model: {model_name}")
    model = SentenceTransformer(model_name)

    embeddings = []
    total = len(df)

    print(f"Embedding {total} papers with weighted sections...")
    print(f"  Weights: title={title_weight}, abstract={abstract_weight}, notes={notes_weight}")

    for idx, (_, row) in enumerate(df.iterrows()):
        if (idx + 1) % 50 == 0 or idx == 0:
            print(f"  Processed {idx + 1}/{total}")

        section_embs = []
        section_weights = []

        # Title
        title = row.get("Title", "")
        if pd.notna(title) and title and str(title).lower() != "nan":
            title_emb = model.encode(str(title))
            section_embs.append(title_emb)
            section_weights.append(title_weight)

        # Abstract
        abstract = row.get("Abstract Note", "")
        if pd.notna(abstract) and abstract and str(abstract).lower() != "nan":
            abstract_str = str(abstract)
            chunks = chunk_text(abstract_str)
            if chunks:
                chunk_embs = model.encode(chunks)
                abstract_emb = np.mean(chunk_embs, axis=0) if len(chunks) > 1 else chunk_embs[0]
                section_embs.append(abstract_emb)
                section_weights.append(abstract_weight)

        # Notes
        notes = row.get("Notes", "")
        if pd.notna(notes) and notes and str(notes).lower() != "nan":
            notes_text = extract_text_from_html(str(notes))
            if notes_text:
                chunks = chunk_text(notes_text)
                if chunks:
                    chunk_embs = model.encode(chunks)
                    notes_emb = np.mean(chunk_embs, axis=0) if len(chunks) > 1 else chunk_embs[0]
                    section_embs.append(notes_emb)
                    section_weights.append(notes_weight)

        # 가중 평균
        if section_embs:
            weights = np.array(section_weights)
            weights = weights / weights.sum()  # 정규화
            final_emb = np.average(section_embs, axis=0, weights=weights)
        else:
            # fallback: 제목만이라도
            fallback_title = row.get("Title", "Untitled")
            final_emb = model.encode(str(fallback_title) if pd.notna(fallback_title) else "Untitled")

        embeddings.append(final_emb)

    print(f"  Processed {total}/{total}")
    return np.array(embeddings)


def embed_multi_vector(df: pd.DataFrame, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2") -> list:
    """Multi-vector 임베딩: 논문당 여러 벡터 (title, abstract chunks, note chunks)"""
    from sentence_transformers import SentenceTransformer

    print(f"Loading model: {model_name}")
    model = SentenceTransformer(model_name)

    all_embeddings = []  # list of lists
    total = len(df)
    total_vectors = 0

    print(f"Embedding {total} papers with multi-vector approach...")

    for idx, (_, row) in enumerate(df.iterrows()):
        if (idx + 1) % 50 == 0 or idx == 0:
            print(f"  Processed {idx + 1}/{total} (total vectors: {total_vectors})")

        paper_embs = []

        # Title (always include)
        title = row.get("Title", "")
        if pd.notna(title) and title and str(title).lower() != "nan":
            title_emb = model.encode(str(title))
            paper_embs.append(title_emb.tolist())

        # Abstract chunks
        abstract = row.get("Abstract Note", "")
        if pd.notna(abstract) and abstract and str(abstract).lower() != "nan":
            abstract_str = str(abstract)
            chunks = chunk_text(abstract_str)
            for chunk in chunks:
                chunk_emb = model.encode(chunk)
                paper_embs.append(chunk_emb.tolist())

        # Note chunks
        notes = row.get("Notes", "")
        if pd.notna(notes) and notes and str(notes).lower() != "nan":
            notes_text = extract_text_from_html(str(notes))
            if notes_text:
                chunks = chunk_text(notes_text)
                for chunk in chunks:
                    chunk_emb = model.encode(chunk)
                    paper_embs.append(chunk_emb.tolist())

        # Fallback: at least title
        if not paper_embs:
            fallback_title = row.get("Title", "Untitled")
            fallback_emb = model.encode(str(fallback_title) if pd.notna(fallback_title) else "Untitled")
            paper_embs.append(fallback_emb.tolist())

        all_embeddings.append(paper_embs)
        total_vectors += len(paper_embs)

    print(f"  Processed {total}/{total}")
    print(f"  Total vectors: {total_vectors} (avg {total_vectors/total:.1f} per paper)")
    return all_embeddings


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

def load_from_csv() -> pd.DataFrame:
    """Load data from CSV files in current directory"""
    csv_files = glob.glob("*.csv")
    if not csv_files:
        raise FileNotFoundError("No CSV files found in current directory")

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
    return df


def load_from_api() -> pd.DataFrame:
    """Load data from Zotero API"""
    from zotero_api import get_zotero_client, fetch_items_as_dataframe

    print("\n[1/5] Loading from Zotero API...")
    zot = get_zotero_client()
    df = fetch_items_as_dataframe(zot)
    print(f"  Loaded {len(df)} items from API")
    return df


def main():
    parser = argparse.ArgumentParser(description="Build paper map from Zotero CSV or API")
    parser.add_argument("--output", default="papers.json", help="Output JSON file")
    parser.add_argument("--source", choices=["csv", "api"], default="csv",
                        help="Data source: csv (default) or api (Zotero API)")
    parser.add_argument("--embedding", choices=["multi", "local", "local-large", "weighted", "openai"], default="multi",
                        help="Embedding: multi (multi-vector, recommended), weighted (legacy), local, local-large, openai")
    parser.add_argument("--clusters", type=int, default=0,
                        help="Number of clusters (0 = HDBSCAN auto, >0 = force KMeans with k)")
    parser.add_argument("--min-cluster-size", type=int, default=18,
                        help="HDBSCAN min_cluster_size (smaller = more clusters)")
    parser.add_argument("--cluster-dims", type=int, default=10,
                        help="Dimensions of the clustering space (display stays 2D). <=2 reuses display coords")
    parser.add_argument("--cluster-selection", choices=["eom", "leaf"], default="leaf",
                        help="HDBSCAN cluster_selection_method: leaf (more, evener) or eom (fewer, larger). "
                             "eom keeps dense regions (AR/VR, memory) as single 400-paper blobs")
    parser.add_argument("--no-inherit-ids", action="store_true",
                        help="Renumber clusters 0..n instead of inheriting IDs from the existing output file")
    parser.add_argument("--id-inherit-threshold", type=float, default=0.5,
                        help="Minimum Jaccard overlap of paper sets for a cluster to inherit a previous ID")
    parser.add_argument("--keep-noise", action="store_true",
                        help="Keep HDBSCAN noise points as a separate unassigned cluster instead of kNN-assigning them")
    parser.add_argument("--dim-reduction", choices=["tsne", "pca", "umap"], default="umap",
                        help="Dimensionality reduction method (umap recommended)")
    parser.add_argument("--min-dist", type=float, default=0.3,
                        help="UMAP min_dist: 0.1(tight) ~ 0.5(spread)")
    parser.add_argument("--merge-threshold", type=float, default=0.0,
                        help="After HDBSCAN, merge clusters with cosine similarity above this threshold (0 = no merge). "
                             "Off by default: at 0.90 it re-collapsed the substructure HDBSCAN had just found "
                             "(e.g. merged autobiographical-memory psychology with lifelogging HCI)")
    parser.add_argument("--all", action="store_true",
                        help="Include all papers (default: notes-only)")
    parser.add_argument("--notes-only", action="store_true", default=True,
                        help="Only include items with notes")
    args = parser.parse_args()

    # 1. 데이터 로드 (CSV 또는 API)
    try:
        if args.source == "api":
            df = load_from_api()
        else:
            df = load_from_csv()
    except FileNotFoundError as e:
        print(f"❌ {e}")
        return
    except ValueError as e:
        print(f"❌ API Error: {e}")
        print("  Set ZOTERO_LIBRARY_ID and ZOTERO_API_KEY in .env file")
        return

    # 중복 제거 (Title + DOI 기준)
    before_dedup = len(df)
    df = df.drop_duplicates(subset=["Title", "DOI"], keep="first")
    df = df.reset_index(drop=True)  # 항상 인덱스 리셋
    if len(df) < before_dedup:
        print(f"  Removed {before_dedup - len(df)} duplicates")

    # 스탠드얼론 노트 제외 (title 없는 note 타입)
    standalone_notes = (df["Item Type"] == "note") & (df["Title"].isna() | (df["Title"].str.strip() == ""))
    if standalone_notes.sum() > 0:
        print(f"  Excluded {standalone_notes.sum()} standalone notes")
        df = df[~standalone_notes]
        df = df.reset_index(drop=True)

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

    use_multi_vector = False
    multi_vector_embeddings = None  # 시맨틱 서치용 (논문당 여러 벡터)
    if args.embedding == "multi":
        # Multi-vector: 논문당 여러 벡터 (추천)
        multi_vector_embeddings = embed_multi_vector(df, "paraphrase-multilingual-MiniLM-L12-v2")
        use_multi_vector = True
        print(f"  Multi-vector embeddings: {len(multi_vector_embeddings)} papers")
        # UMAP용 평균 벡터 계산 (multi_vector_embeddings는 이미 list of lists)
        embeddings = np.array([np.mean(np.array(vecs), axis=0) for vecs in multi_vector_embeddings])
        print(f"  Mean embedding shape for UMAP: {embeddings.shape}")
    elif args.embedding == "weighted":
        # 청킹 + 섹션별 가중치 (legacy)
        embeddings = embed_with_weighted_sections(df, "paraphrase-multilingual-MiniLM-L12-v2")
        print(f"  Embedding shape: {embeddings.shape}")
    elif args.embedding == "local":
        texts = [build_text_for_embedding(row) for _, row in df.iterrows()]
        embeddings = embed_with_sentence_transformers(texts, "paraphrase-multilingual-MiniLM-L12-v2")
        print(f"  Embedding shape: {embeddings.shape}")
    elif args.embedding == "local-large":
        texts = [build_text_for_embedding(row) for _, row in df.iterrows()]
        embeddings = embed_with_sentence_transformers(texts, "paraphrase-multilingual-mpnet-base-v2")
        print(f"  Embedding shape: {embeddings.shape}")
    else:
        texts = [build_text_for_embedding(row) for _, row in df.iterrows()]
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
    # coords       = 화면 표시용 2D 좌표 (min_dist 크게 → 보기 좋게 퍼짐)
    # cluster_space = 클러스터링용 중간 차원 (min_dist=0 → 밀도 구조 보존)
    # 2D 레이아웃은 시각화를 위해 위상을 뭉개므로 여기서 밀도 클러스터링을 하면
    # 서로 다른 토픽이 겹쳐버린다. 두 공간을 분리한다.
    cluster_space = None
    if args.dim_reduction == "umap":
        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=15,
            min_dist=args.min_dist,
            metric='cosine',
            random_state=42
        )
        coords = reducer.fit_transform(combined)
        print(f"  UMAP (display): 2D, min_dist={args.min_dist}")

        cluster_dims = min(args.cluster_dims, combined.shape[1])
        if cluster_dims <= 2:
            cluster_space = coords
            print(f"  UMAP (clustering): reusing 2D display coords")
        else:
            cluster_reducer = umap.UMAP(
                n_components=cluster_dims,
                n_neighbors=15,
                min_dist=0.0,
                metric='cosine',
                random_state=42
            )
            cluster_space = cluster_reducer.fit_transform(combined)
            print(f"  UMAP (clustering): {cluster_dims}D, min_dist=0.0")
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

    if cluster_space is None:
        # tsne/pca 경로: 클러스터링은 PCA로 중간 차원까지만 줄여서 수행
        cluster_dims = min(args.cluster_dims, combined.shape[1])
        if cluster_dims <= 2:
            cluster_space = coords
        else:
            cluster_space = PCA(n_components=cluster_dims,
                                random_state=42).fit_transform(combined)
        print(f"  Clustering space: PCA {cluster_space.shape[1]}D")

    df["x"] = coords[:, 0]
    df["y"] = coords[:, 1]

    # 5. 클러스터링
    n_clusters_manual = args.clusters
    if n_clusters_manual > 0:
        # 수동 지정: KMeans 사용
        print(f"\n[5/5] Clustering into {n_clusters_manual} clusters (KMeans)...")
        kmeans = KMeans(n_clusters=n_clusters_manual, random_state=42, n_init=10)
        df["cluster"] = kmeans.fit_predict(combined)
        n_clusters = n_clusters_manual
    else:
        # HDBSCAN은 표시용 2D가 아니라 중간 차원 cluster_space 위에서 수행
        min_cs = args.min_cluster_size
        print(f"\n[5/5] Clustering with HDBSCAN on {cluster_space.shape[1]}D space "
              f"(min_cluster_size={min_cs}, selection={args.cluster_selection})...")
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cs,
            min_samples=5,
            metric='euclidean',
            cluster_selection_method=args.cluster_selection,
        )
        labels = clusterer.fit_predict(cluster_space)

        n_found = len(set(labels) - {-1})
        n_noise = int((labels == -1).sum())
        print(f"  Found {n_found} clusters, {n_noise} noise points ({n_noise*100//len(df)}%)")

        # 노이즈 포인트(-1) 처리
        #   기본: kNN으로 가장 가까운 '이웃 점들'의 다수결에 배정.
        #   (NearestCentroid는 초승달/고리 모양 클러스터에서 centroid가 클러스터
        #    바깥에 놓여 엉뚱한 배정을 만든다.)
        #   --keep-noise: 배정하지 않고 별도 '미분류' 클러스터로 남긴다.
        if n_noise > 0 and n_found > 0 and not args.keep_noise:
            from sklearn.neighbors import KNeighborsClassifier
            non_noise_mask = labels != -1
            k = int(min(15, non_noise_mask.sum()))
            knn = KNeighborsClassifier(n_neighbors=k, weights='distance')
            knn.fit(cluster_space[non_noise_mask], labels[non_noise_mask])
            noise_mask = labels == -1
            probs = knn.predict_proba(cluster_space[noise_mask])
            labels[noise_mask] = knn.classes_[probs.argmax(axis=1)]
            confident = int((probs.max(axis=1) >= 0.5).sum())
            print(f"  Reassigned {n_noise} noise points via {k}-NN "
                  f"({confident} with >=50% neighbor agreement)")
        elif n_noise > 0 and args.keep_noise:
            print(f"  Keeping {n_noise} noise points as a separate unassigned cluster")

        # 클러스터 ID를 0부터 연속으로 재매핑 (노이즈 -1은 그대로 둔다)
        unique_labels = sorted(set(labels) - {-1})
        label_map = {old: new for new, old in enumerate(unique_labels)}
        labels = np.array([label_map.get(l, -1) for l in labels])

        df["cluster"] = labels
        n_clusters = len(unique_labels)
        print(f"  Final: {n_clusters} clusters"
              + (f" + unassigned" if (labels == -1).any() else ""))

        # 클러스터 크기 분포 출력
        from collections import Counter
        size_dist = Counter(labels)
        for cid in sorted(size_dist.keys()):
            name = "unassigned" if cid == -1 else f"Cluster {cid}"
            print(f"    {name}: {size_dist[cid]} papers")

    # 5.5. 클러스터 병합 (HDBSCAN 후 비슷한 클러스터끼리 합치기)
    merge_thresh = args.merge_threshold
    if merge_thresh > 0 and n_clusters > 1:
        from sklearn.metrics.pairwise import cosine_similarity

        print(f"\n[5.5] Merging clusters with cosine similarity > {merge_thresh}...")

        # 클러스터별 평균 임베딩 (고차원)
        cluster_mean_emb = np.zeros((n_clusters, embeddings.shape[1]))
        for c in range(n_clusters):
            mask = df["cluster"].values == c
            cluster_mean_emb[c] = embeddings[mask].mean(axis=0)

        # 반복적으로 가장 유사한 쌍을 병합
        old_to_new = {c: c for c in range(n_clusters)}
        merged = True
        while merged:
            merged = False
            # 현재 활성 클러스터 목록
            active = sorted(set(old_to_new.values()))
            if len(active) <= 1:
                break
            # 활성 클러스터의 평균 임베딩 재계산
            active_embs = np.zeros((len(active), embeddings.shape[1]))
            for i, c in enumerate(active):
                mask = np.array([old_to_new[orig] == c for orig in df["cluster"].values])
                active_embs[i] = embeddings[mask].mean(axis=0)
            sim_matrix = cosine_similarity(active_embs)
            np.fill_diagonal(sim_matrix, 0)
            max_sim = sim_matrix.max()
            if max_sim >= merge_thresh:
                i, j = np.unravel_index(sim_matrix.argmax(), sim_matrix.shape)
                c_keep, c_merge = active[min(i,j)], active[max(i,j)]
                # c_merge → c_keep
                for orig, cur in old_to_new.items():
                    if cur == c_merge:
                        old_to_new[orig] = c_keep
                print(f"    Merged cluster {c_merge} → {c_keep} (sim={max_sim:.3f})")
                merged = True

        # 연속 ID로 재매핑
        final_active = sorted(set(old_to_new.values()))
        remap = {old: new for new, old in enumerate(final_active)}
        for orig in old_to_new:
            old_to_new[orig] = remap[old_to_new[orig]]

        # 미분류(-1)는 병합 대상이 아니므로 그대로 통과시킨다
        df["cluster"] = [old_to_new.get(c, -1) for c in df["cluster"].values]
        n_clusters = len(final_active)

        from collections import Counter
        new_counts = Counter(df["cluster"].values)
        print(f"  After merge: {n_clusters} clusters")
        for c in sorted(new_counts.keys()):
            name = "unassigned" if c == -1 else f"Cluster {c}"
            print(f"    {name}: {new_counts[c]} papers")

    # 5.6. 미분류(-1) 논문을 마지막 클러스터 ID로 승격 (다운스트림은 음수 ID를 모른다)
    noise_cluster_id = None
    if (df["cluster"].values == -1).any():
        noise_cluster_id = n_clusters
        df["cluster"] = [noise_cluster_id if c == -1 else c for c in df["cluster"].values]
        n_clusters += 1
        print(f"  Unassigned papers collected into cluster {noise_cluster_id}")

    # 5.7. 클러스터 ID 승계
    #
    # HDBSCAN은 매 빌드마다 클러스터를 0..n으로 새로 번호 매긴다. 논문 몇 편만 늘어도
    # 번호가 밀려서, localStorage에 저장된 커스텀 클러스터 라벨이 전혀 다른 주제의
    # 클러스터에 붙어버린다.
    #
    # 이전 빌드의 papers.json과 zotero_key 교집합을 재서, 같은 논문 집합을 이어받은
    # 클러스터에는 예전 ID를 물려준다. 승계 기준을 못 넘긴 클러스터는 '한 번도 쓰인 적
    # 없는' 번호를 새로 받는다 — ID를 재활용하지 않으므로, 오래된 커스텀 라벨이 엉뚱한
    # 클러스터에 얹히는 일이 원천적으로 생기지 않는다.
    cluster_ids = sorted(set(int(c) for c in df["cluster"].values))
    id_inheritance = None
    if not args.no_inherit_ids and Path(args.output).exists():
        try:
            from scipy.optimize import linear_sum_assignment
            with open(args.output, encoding="utf-8") as f:
                prev = json.load(f)
            prev_of_key = {}
            for p in prev.get("papers", []):
                k = p.get("zotero_key")
                if k:
                    prev_of_key[k] = int(p["cluster"])
            prev_ids = sorted(set(prev_of_key.values()))

            if prev_ids:
                print(f"\n[5.7] Inheriting cluster IDs from existing {args.output} "
                      f"({len(prev_ids)} previous clusters, threshold jaccard>={args.id_inherit_threshold})...")
                keys = [str(row.get("Key", "") or "") for _, row in df.iterrows()]
                new_members = {c: set() for c in cluster_ids}
                for k, c in zip(keys, df["cluster"].values):
                    if k:
                        new_members[int(c)].add(k)
                prev_members = {c: set() for c in prev_ids}
                for k, c in prev_of_key.items():
                    prev_members[c].add(k)

                # 자카드 유사도 행렬 → 헝가리안 알고리즘으로 전역 최적 1:1 배정
                J = np.zeros((len(cluster_ids), len(prev_ids)))
                for a, nc in enumerate(cluster_ids):
                    A = new_members[nc]
                    if not A:
                        continue
                    for b, pc in enumerate(prev_ids):
                        B = prev_members[pc]
                        inter = len(A & B)
                        if inter:
                            J[a, b] = inter / len(A | B)
                rows, cols = linear_sum_assignment(-J)

                inherited = {}
                for a, b in zip(rows, cols):
                    if J[a, b] >= args.id_inherit_threshold:
                        inherited[cluster_ids[a]] = prev_ids[b]

                # 새 ID는 '지금까지 쓰인 적 없는' 번호부터 — 절대 재활용하지 않는다
                prev_max = prev.get("meta", {}).get("max_cluster_id")
                next_id = max(prev_ids) if prev_max is None else max(int(prev_max), max(prev_ids))
                next_id += 1
                remap = {}
                for nc in cluster_ids:
                    if nc in inherited:
                        remap[nc] = inherited[nc]
                    else:
                        remap[nc] = next_id
                        next_id += 1

                df["cluster"] = [remap[int(c)] for c in df["cluster"].values]
                if noise_cluster_id is not None:
                    noise_cluster_id = remap[noise_cluster_id]
                cluster_ids = sorted(remap.values())
                id_inheritance = {
                    "inherited": len(inherited),
                    "fresh": len(cluster_ids) - len(inherited),
                    "max_cluster_id": next_id - 1,
                }
                print(f"  Inherited {len(inherited)} IDs, allocated "
                      f"{id_inheritance['fresh']} new ones (IDs are never reused)")
                for nc in sorted(remap, key=lambda x: remap[x]):
                    n = int((df["cluster"].values == remap[nc]).sum())
                    if nc in inherited:
                        print(f"    c{remap[nc]:<3d} ({n:4d})  ← previous c{inherited[nc]}")
                    else:
                        print(f"    c{remap[nc]:<3d} ({n:4d})  ← new cluster")
        except Exception as e:
            print(f"  [5.7] Cluster ID inheritance skipped: {e}")
            cluster_ids = sorted(set(int(c) for c in df["cluster"].values))

    n_clusters = len(cluster_ids)

    # 지금까지 발급된 적 있는 최대 ID. 이번 빌드에서 큰 ID의 클러스터가 사라지더라도
    # 값이 내려가면 안 된다 — 내려가면 다음 빌드가 그 번호를 재활용해버린다.
    max_cluster_id_ever = max(cluster_ids) if cluster_ids else -1
    if id_inheritance:
        max_cluster_id_ever = max(max_cluster_id_ever, id_inheritance["max_cluster_id"])

    # 6. 클러스터 라벨 생성 (c-TF-IDF)
    #
    # 기존 방식은 클러스터별로 텍스트를 이어붙여 "문서 n_clusters개" 코퍼스를 만들고
    # TfidfVectorizer를 돌렸다. 그러면 IDF의 분모가 클러스터 수(=16 남짓)뿐이라
    # IDF가 사실상 작동하지 않고, 그 공백을 1/n² 패널티로 메우고 있었다.
    #
    # c-TF-IDF는 TF만 클러스터 단위로 모으고 IDF는 '논문 전체 코퍼스' 기준으로 잰다.
    #   tf   : 논문별 term count를 L2 정규화한 뒤 클러스터로 합산 → 클러스터 내 비율
    #          (정규화하지 않으면 초록 긴 논문 몇 편이 큰 클러스터의 라벨을 좌우한다)
    #   idf  : log(N_papers / (1 + df_t)),  df_t = 해당 단어를 포함한 '논문' 수
    #   excl : 그 단어의 전체 질량 중 이 클러스터가 차지하는 비율 (0~1)
    #          — 1/n² 대신 쓰는 부드러운 변별력 가중치.
    #          지수를 1.0으로 두면 한 클러스터에만 나오는 희소 약어(ogm, pf, esm …)가
    #          과보상되어 라벨을 차지한다. 0.7로 눌러 풀어쓴 용어가 올라오게 한다.
    print("\nGenerating cluster labels (c-TF-IDF)...")

    # 한국어 조사 제거 전처리
    def strip_korean_particles(text):
        import re
        # 조사 패턴 (단어 끝에 붙는 것들). 긴 것부터 매칭해야 '에서'가 '에'로 잘리지 않는다.
        particles = (r'(으로서|이라는|에서는|에게서|이라고|라는|이라|으로|에서|에게|까지|'
                     r'부터|보다|처럼|마다|조차|뿐만|을|를|이|가|은|는|에|의|로|와|과|도|만|란|라)$')
        words = text.split()
        cleaned = []
        for word in words:
            if re.search(r'[가-힣]', word):
                cleaned_word = re.sub(particles, '', word)
                if len(cleaned_word) >= 2:  # 너무 짧아지면 원본 유지
                    cleaned.append(cleaned_word)
                else:
                    cleaned.append(word)
            else:
                cleaned.append(word)
        return ' '.join(cleaned)

    # 논문 단위 문서 (클러스터별로 이어붙이지 않는다)
    paper_docs = []
    paper_clusters = []
    for idx, row in df.iterrows():
        title = row.get('Title', '') if pd.notna(row.get('Title', '')) else ''
        abstract = row.get('Abstract Note', '') if pd.notna(row.get('Abstract Note', '')) else ''
        notes = row.get('Notes', '') if pd.notna(row.get('Notes', '')) else ''
        notes_text = extract_text_from_html(notes) if notes else ''
        paper_docs.append(strip_korean_particles(f"{title} {abstract} {notes_text}"))
        paper_clusters.append(int(row["cluster"]))
    paper_clusters = np.array(paper_clusters)

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
        'however', 'while', 'these', 'both', 'each', 'other', 'some', 'many', 'most',
        'show', 'shows', 'showed', 'propose', 'proposed', 'present', 'presented',
        'approach', 'approaches', 'work', 'works', 'new', 'novel', 'different',
        'participants', 'participant', 'user', 'users', 'system', 'systems', 'design',
        # Korean
        '및', '등', '를', '을', '이', '가', '은', '는', '에', '의', '로', '으로', '와', '과',
        '하는', '있는', '되는', '한', '된', '수', '것', '대한', '통해', '위해', '대해',
        '연구', '기술', '위한', '사용', '제안', '보여', '제시', '기반', '활용', '가능',
        '사용자', '논문', '시스템', '인터페이스', '사람', '정보', '방법', '결과',
        '모델', '분석', '설계', '개발', '평가', '실험', '참여자', '프로세스',
        # 이전 빌드에서 라벨로 새어나온 기능어/범용어
        '있다', '없다', '한다', '된다', '하다', '이다', '있음', '같은', '통한', '따라',
        '실제', '기존', '인간', '이러한', '그러나', '또한', '때문', '경우', '다양',
        '중요', '필요', '영향', '관련', '특정', '일부', '전체', '최근', '다른', '모든',
        '하지만', '그리고', '먼저', '다음', '이를', '우리', '자신', '서로', '더욱',
    ]

    # 논문 단위 term count. IDF의 분모가 되는 '문서'는 이제 논문이다.
    count_vec = CountVectorizer(
        max_features=20000,
        stop_words=multilingual_stop_words,
        ngram_range=(1, 2),
        min_df=5,   # 5편 미만에만 등장하는 단어는 라벨 후보에서 제외
        token_pattern=r'(?u)\b[가-힣a-zA-Z]{2,}\b'  # 한글/영어 2글자 이상
    )
    X = count_vec.fit_transform(paper_docs)          # (n_papers, vocab)
    feature_names = count_vec.get_feature_names_out()
    n_papers_total = X.shape[0]
    print(f"  Vocabulary: {len(feature_names)} terms over {n_papers_total} papers")

    # 전역 IDF: 단어를 포함한 '논문' 수 기준
    df_global = np.asarray((X > 0).sum(axis=0)).ravel()
    idf = np.log(n_papers_total / (1.0 + df_global))
    idf = np.maximum(idf, 0.0)

    # 논문별 L2 정규화 후 클러스터 합산 → 긴 초록이 라벨을 독점하지 못하게
    X_norm = normalize(X, norm='l2', axis=1)
    class_tf = np.zeros((len(cluster_ids), len(feature_names)))
    for pos, c in enumerate(cluster_ids):
        mask = paper_clusters == c
        if mask.any():
            class_tf[pos] = np.asarray(X_norm[mask].sum(axis=0)).ravel()

    # 클러스터 내 비율로 정규화
    row_sums = class_tf.sum(axis=1, keepdims=True)
    tf_ratio = class_tf / np.maximum(row_sums, 1e-12)

    # 변별력: 이 단어의 전체 질량 중 해당 클러스터의 몫 (1/n² 패널티 대체)
    col_sums = class_tf.sum(axis=0, keepdims=True)
    exclusivity = class_tf / np.maximum(col_sums, 1e-12)

    EXCLUSIVITY_POWER = 0.7
    ctfidf = tf_ratio * idf[None, :] * (exclusivity ** EXCLUSIVITY_POWER)

    def pick_keywords(scores, k):
        """상위 키워드 선택. 이미 고른 n-gram에 포함되는 단어는 건너뛴다.
        (예전 라벨 '다크 패턴, 다크, 패턴'처럼 같은 말이 세 번 나오는 것을 막는다)"""
        picked = []
        for j in scores.argsort()[::-1]:
            if scores[j] <= 0:
                break
            term = feature_names[j]
            parts = set(term.split())
            redundant = False
            for prev in picked:
                prev_parts = set(prev.split())
                if parts <= prev_parts or prev_parts <= parts:
                    redundant = True
                    break
            if not redundant:
                picked.append(term)
            if len(picked) >= k:
                break
        return picked

    # 표시용 라벨은 클러스터마다 따로 뽑으면 안 된다. c-TF-IDF 상위 단어를 독립적으로
    # 고르면 같은 단어가 여러 라벨에 동시에 뽑힌다 — 이전 빌드에서 '기억'은 5개,
    # '사진'은 3개 클러스터의 라벨에 들어가 범례를 읽을 수 없게 만들었다.
    #
    # 그래서 라운드마다 헝가리안 알고리즘으로 (클러스터 × 후보 단어) 1:1 배정을 풀어,
    # 한 단어가 최대 한 라벨에만 들어가게 한다. 총점을 최대화하므로, 겹치는 단어는
    # 그 단어가 가장 잘 설명하는 클러스터에 돌아간다.
    LABEL_TERMS = 3        # 라벨에 넣을 단어 수
    LABEL_CANDIDATES = 40  # 클러스터당 배정 후보 수

    label_positions = [pos for pos, i in enumerate(cluster_ids) if i != noise_cluster_id]
    candidates = {}
    for pos in label_positions:
        order = [j for j in ctfidf[pos].argsort()[::-1][:400] if ctfidf[pos][j] > 0]
        candidates[pos] = order[:LABEL_CANDIDATES]

    chosen = {pos: [] for pos in label_positions}
    used_terms = set()
    for _ in range(LABEL_TERMS):
        pool = sorted({j for pos in label_positions for j in candidates[pos] if j not in used_terms})
        if not pool:
            break
        col_of = {j: x for x, j in enumerate(pool)}
        cost = np.full((len(label_positions), len(pool)), -1e9)
        for r, pos in enumerate(label_positions):
            for j in candidates[pos]:
                if j in used_terms:
                    continue
                # 이미 고른 n-gram에 포함되는 단어는 건너뛴다 ('다크 패턴' 다음의 '다크')
                parts = set(feature_names[j].split())
                if any(parts <= set(q.split()) or set(q.split()) <= parts for q in chosen[pos]):
                    continue
                cost[r, col_of[j]] = ctfidf[pos][j]
        rows, cols = linear_sum_assignment(-cost)
        for r, x in zip(rows, cols):
            if cost[r, x] <= -1e8:
                continue
            j = pool[x]
            chosen[label_positions[r]].append(feature_names[j])
            used_terms.add(j)

    cluster_labels = {}
    cluster_keywords = {}
    for pos, i in enumerate(cluster_ids):
        # cluster_keywords는 배정 제약 없이 그대로 상위 10개 (LLM 라벨링 등의 입력용)
        cluster_keywords[i] = pick_keywords(ctfidf[pos], 10)
        if noise_cluster_id is not None and i == noise_cluster_id:
            cluster_labels[i] = "미분류"
            cluster_keywords[i] = []
        else:
            terms = chosen.get(pos) or pick_keywords(ctfidf[pos], LABEL_TERMS)
            cluster_labels[i] = ", ".join(terms) if terms else f"Cluster {i}"
        size = int((paper_clusters == i).sum())
        print(f"  Cluster {i} ({size} papers): {cluster_labels[i]}")
        if cluster_keywords[i][3:]:
            print(f"      also: {', '.join(cluster_keywords[i][3:])}")

    dup = collections.Counter(t for lbl in cluster_labels.values() for t in lbl.split(", "))
    n_dup = sum(1 for n in dup.values() if n > 1)
    print(f"  Terms appearing in more than one label: {n_dup}")

    # 6.5. 클러스터 중심점 계산 (2D 좌표 기준)
    print("\nCalculating cluster centroids...")
    cluster_centroids = {}
    for i in cluster_ids:
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
    existing_reference_cache = {}
    try:
        with open(args.output, "r", encoding="utf-8") as f:
            existing = json.load(f)
            existing_papers = existing.get("papers", existing)
            existing_citation_links = existing.get("citation_links", [])
            existing_reference_cache = existing.get("reference_cache", {})
            for p in existing_papers:
                if p.get("doi"):
                    existing_citation_data[p["doi"]] = {
                        "citation_count": p.get("citation_count"),
                        "s2_id": p.get("s2_id", ""),
                        "references": p.get("references", []),
                        "citations": p.get("citations", []),
                    }
        print(f"  Loaded citation data for {len(existing_citation_data)} papers")
        if existing_reference_cache:
            print(f"  Loaded reference_cache with {len(existing_reference_cache)} entries")
    except:
        pass

    records = []
    review_count = 0
    for idx, (_, row) in enumerate(df.iterrows()):
        # 기존 태그 가져오기
        raw_tags = row.get("Manual Tags", "")
        manual_tags = str(raw_tags) if pd.notna(raw_tags) and raw_tags else ""

        # method-review 자동 태깅
        title = str(row.get("Title", "") or "")
        abstract = str(row.get("Abstract Note", "") or "")
        if is_review_paper(title, abstract):
            if "method-review" not in manual_tags:
                if manual_tags:
                    manual_tags = f"{manual_tags}; method-review"
                else:
                    manual_tags = "method-review"
                review_count += 1

        rec = {
            "id": int(idx),
            "zotero_key": str(row.get("Key", "") or ""),  # Zotero item key for API sync
            "title": title,
            "year": int(row["year_clean"]) if pd.notna(row["year_clean"]) else None,
            "authors": str(row.get("Author", "") or ""),
            "venue": get_venue_abbrev(venue_full := str(row.get("Publication Title", "") or row.get("Proceedings Title", "") or row.get("Conference Name", "") or "")),
            "venue_full": venue_full,
            "item_type": str(row.get("Item Type", "") or ""),
            "is_paper": bool(row["is_paper"]),
            "venue_quality": float(row["venue_quality"]),
            "x": float(row["x"]),
            "y": float(row["y"]),
            "cluster": int(row["cluster"]),
            "cluster_label": cluster_labels.get(int(row["cluster"]), ""),
            "url": str(row.get("Url", "") or ""),
            "doi": str(row.get("DOI", "") or ""),
            "pdf_key": str(row.get("PDF Key", "") or ""),
            "abstract": abstract[:500],  # 길이 제한
            "tags": manual_tags,
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

        # 임베딩 추가 (시맨틱 검색용)
        if use_multi_vector:
            # multi_vector_embeddings는 list of list of lists (이미 tolist() 됨)
            rec["embeddings"] = multi_vector_embeddings[idx]
        else:
            rec["embedding"] = embeddings[idx].tolist()

        records.append(rec)

    # 데이터 소스 업데이트 시간
    if args.source == "api":
        data_updated = datetime.now().strftime("%Y-%m-%d %H:%M")
    else:
        csv_files = glob.glob("*.csv")
        csv_mtime = max(os.path.getmtime(f) for f in csv_files) if csv_files else 0
        data_updated = datetime.fromtimestamp(csv_mtime).strftime("%Y-%m-%d %H:%M")

    # S2 ID → paper ID 매핑 생성 후 citation_links 재생성
    s2_to_id = {r["s2_id"]: r["id"] for r in records if r.get("s2_id")}
    citation_links_set = set()
    for rec in records:
        source_id = rec["id"]
        # 이 논문이 인용한 것 (references)
        for ref_s2_id in rec.get("references", []):
            if ref_s2_id in s2_to_id:
                target_id = s2_to_id[ref_s2_id]
                citation_links_set.add((source_id, target_id))
        # 이 논문을 인용한 것 (citations) - 역방향
        for cite_s2_id in rec.get("citations", []):
            if cite_s2_id in s2_to_id:
                citing_id = s2_to_id[cite_s2_id]
                citation_links_set.add((citing_id, source_id))
    citation_links = [{"source": s, "target": t} for s, t in citation_links_set]
    print(f"   - Internal citation links: {len(citation_links)}")

    # 출력 데이터에 클러스터 중심점 포함
    output_data = {
        "papers": records,
        "cluster_centroids": cluster_centroids,
        "cluster_labels": cluster_labels,
        "cluster_keywords": cluster_keywords,
        "citation_links": citation_links,  # S2 ID 기반 재생성
        "reference_cache": existing_reference_cache,  # S2 외부 참조 캐시 보존
        "meta": {
            "source": args.source,
            "data_updated": data_updated,
            "map_built": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "total_papers": sum(1 for r in records if r['is_paper']),
            "total_apps": sum(1 for r in records if not r['is_paper']),
            "clusters": n_clusters,
            # 지금까지 한 번이라도 할당된 최대 클러스터 ID.
            # 다음 빌드가 새 ID를 이 값 위에서부터 발급해 ID 재활용을 막는다.
            "max_cluster_id": max_cluster_id_ever,
            "zotero_library_id": os.environ.get("ZOTERO_LIBRARY_ID", ""),
            "zotero_library_type": os.environ.get("ZOTERO_LIBRARY_TYPE", "user")
        }
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Done! Generated {args.output} with {len(records)} items")
    print(f"   - Papers: {sum(1 for r in records if r['is_paper'])}")
    print(f"   - Apps/Services: {sum(1 for r in records if not r['is_paper'])}")
    print(f"   - Clusters: {n_clusters}")
    print(f"   - Auto-tagged reviews: {review_count}")


if __name__ == "__main__":
    main()
