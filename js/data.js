/* ===========================================
   Data Loading & Filtering
   =========================================== */

async function loadData() {
  try {
    const resp = await fetch('papers.json');
    const data = await resp.json();

    // 새 포맷 (papers 배열 + centroids) vs 기존 포맷 (배열만)
    if (data.papers) {
      allPapers = data.papers;
      clusterCentroids = data.cluster_centroids || {};
      clusterLabels = data.cluster_labels || {};
      citationLinks = data.citation_links || [];
      referenceCache = data.reference_cache || {};
      dataMeta = data.meta || {};
    } else {
      allPapers = data;
    }

    // 로컬 스토리지에서 커스텀 라벨 로드
    const customLabels = JSON.parse(localStorage.getItem('customClusterLabels') || '{}');
    Object.assign(clusterLabels, customLabels);

    // 북마크 로드
    const savedBookmarks = JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]');
    bookmarkedPapers = new Set(savedBookmarks);

    // Populate tag filter
    const tagFilterEl = document.getElementById('tagFilter');
    allPapers.forEach(p => {
      if (p.tags) {
        p.tags.split(/[;,]/).forEach(t => {
          const tag = t.trim();
          if (tag) allTags.add(tag);
        });
      }
    });
    [...allTags].sort().forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      tagFilterEl.appendChild(opt);
    });

    // Populate cluster filter with labels
    const clusters = [...new Set(allPapers.map(p => p.cluster))].sort((a,b) => a-b);
    const clusterListEl = document.getElementById('clusterList');

    clusters.forEach(c => {
      const sample = allPapers.find(p => p.cluster === c);
      const label = clusterLabels[c] || sample?.cluster_label || '';
      const count = allPapers.filter(p => p.cluster === c).length;

      // 클러스터 패널 아이템
      const item = document.createElement('div');
      item.className = 'cluster-item';
      item.dataset.cluster = c;
      item.innerHTML = `
        <div class="dot" style="background: ${CLUSTER_COLORS[c % CLUSTER_COLORS.length]}"></div>
        <div class="label" title="Double-click to edit">${label || 'Cluster ' + c}</div>
        <div class="count">${count}</div>
        <button class="stats-btn" title="Cluster stats">📊</button>
      `;

      // 통계 버튼 클릭
      item.querySelector('.stats-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showClusterStats(c, e);
      });

      item.addEventListener('click', () => {
        if (highlightCluster === c) {
          highlightCluster = null;
          item.classList.remove('active');
        } else {
          document.querySelectorAll('.cluster-item').forEach(el => el.classList.remove('active'));
          highlightCluster = c;
          item.classList.add('active');
        }
        applyFilters();
      });

      // 더블클릭으로 라벨 편집
      const labelEl = item.querySelector('.label');
      labelEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const currentLabel = clusterLabels[c] || '';
        const newLabel = prompt(`Edit label for Cluster ${c}:`, currentLabel);
        if (newLabel !== null && newLabel !== currentLabel) {
          clusterLabels[c] = newLabel;
          labelEl.textContent = newLabel || 'Cluster ' + c;
          const customLabels = JSON.parse(localStorage.getItem('customClusterLabels') || '{}');
          customLabels[c] = newLabel;
          localStorage.setItem('customClusterLabels', JSON.stringify(customLabels));
          allPapers.forEach(p => {
            if (p.cluster === c) p.cluster_label = newLabel;
          });
        }
      });

      clusterListEl.appendChild(item);
    });

    currentFiltered = [...allPapers];
    render(currentFiltered);
    updateStats(currentFiltered);
    showDefaultPanel();

    // Initialize mobile components
    const mobileTagFilter = document.getElementById('mobileTagFilter');
    if (mobileTagFilter) {
      [...allTags].sort().forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        mobileTagFilter.appendChild(opt);
      });
    }
    populateMobileClusterChips();
  } catch (e) {
    document.getElementById('stats').textContent = 'Error loading papers.json';
    console.error(e);
  }
}

function filterPapers() {
  const minVenue = parseFloat(document.getElementById('minVenue').value) || 0;
  const papersOnly = document.getElementById('papersOnly').checked;
  const bookmarkedOnly = document.getElementById('bookmarkedOnly').checked;
  const tagFilter = document.getElementById('tagFilter').value;
  const searchFilter = document.getElementById('searchFilter').value.toLowerCase().trim();

  return allPapers.filter(p => {
    // Default: only show papers with notes
    if (!p.has_notes) return false;
    if (p.venue_quality < minVenue) return false;
    if (papersOnly && !p.is_paper) return false;
    if (bookmarkedOnly && !bookmarkedPapers.has(p.id)) return false;
    if (tagFilter) {
      const paperTags = (p.tags || '').split(/[;,]/).map(t => t.trim().toLowerCase());
      if (!paperTags.includes(tagFilter.toLowerCase())) return false;
    }
    if (searchFilter) {
      const searchText = `${p.title} ${p.authors || ''} ${p.abstract} ${p.notes || ''}`.toLowerCase();
      if (!searchText.includes(searchFilter)) return false;
    }
    // Year range filter (from mini timeline brush)
    if (yearRange) {
      if (p.year && (p.year < yearRange.min || p.year > yearRange.max)) return false;
    }
    // Cluster filter (when in filter mode)
    if (filterMode === 'filter' && highlightCluster !== null) {
      if (p.cluster !== highlightCluster) return false;
    }
    return true;
  });
}

function updateFilterChips() {
  const container = document.getElementById('filterChips');
  if (!container) return;

  container.innerHTML = '';

  // Cluster chip
  if (highlightCluster !== null) {
    const label = clusterLabels[highlightCluster] || `Cluster ${highlightCluster}`;
    const chip = document.createElement('span');
    chip.className = 'filter-chip cluster';
    chip.innerHTML = `📌 ${label} <span class="chip-close">✕</span>`;
    chip.onclick = () => {
      highlightCluster = null;
      document.querySelectorAll('.cluster-item').forEach(el => el.classList.remove('active'));
      applyFilters();
    };
    container.appendChild(chip);
  }

  // Tag chip
  const tagFilter = document.getElementById('tagFilter').value;
  if (tagFilter) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip tag';
    chip.innerHTML = `🏷️ ${tagFilter} <span class="chip-close">✕</span>`;
    chip.onclick = () => {
      document.getElementById('tagFilter').value = '';
      applyFilters();
    };
    container.appendChild(chip);
  }

  // Search chip
  const searchFilter = document.getElementById('searchFilter').value.trim();
  if (searchFilter) {
    const displayText = searchFilter.length > 15 ? searchFilter.substring(0, 15) + '...' : searchFilter;
    const chip = document.createElement('span');
    chip.className = 'filter-chip search';
    chip.innerHTML = `🔍 "${displayText}" <span class="chip-close">✕</span>`;
    chip.onclick = () => {
      document.getElementById('searchFilter').value = '';
      applyFilters();
    };
    container.appendChild(chip);
  }

  // Year range chip
  if (yearRange) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip year';
    chip.innerHTML = `📅 ${yearRange.min}-${yearRange.max} <span class="chip-close">✕</span>`;
    chip.onclick = () => {
      yearRange = null;
      document.getElementById('brushSelection').classList.remove('active');
      applyFilters();
      if (typeof renderMiniTimeline === 'function') renderMiniTimeline(allPapers);
    };
    container.appendChild(chip);
  }

  // Bookmarked chip
  if (document.getElementById('bookmarkedOnly').checked) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `★ Bookmarked <span class="chip-close">✕</span>`;
    chip.onclick = () => {
      document.getElementById('bookmarkedOnly').checked = false;
      applyFilters();
    };
    container.appendChild(chip);
  }
}

function updateStats(papers) {
  document.getElementById('stats').textContent = `${papers.length} items`;
}

function toggleBookmark(paperId) {
  if (bookmarkedPapers.has(paperId)) {
    bookmarkedPapers.delete(paperId);
  } else {
    bookmarkedPapers.add(paperId);
  }
  localStorage.setItem('bookmarkedPapers', JSON.stringify([...bookmarkedPapers]));
  updateStats(currentFiltered);
  return bookmarkedPapers.has(paperId);
}
