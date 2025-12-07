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
      dataMeta = data.meta || {};
    } else {
      allPapers = data;
    }

    // 로컬 스토리지에서 커스텀 라벨 로드
    const customLabels = JSON.parse(localStorage.getItem('customClusterLabels') || '{}');
    Object.assign(clusterLabels, customLabels);

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
    const intersect1 = document.getElementById('intersectCluster1');
    const intersect2 = document.getElementById('intersectCluster2');
    const clusterListEl = document.getElementById('clusterList');

    clusters.forEach(c => {
      const sample = allPapers.find(p => p.cluster === c);
      const label = clusterLabels[c] || sample?.cluster_label || '';
      const count = allPapers.filter(p => p.cluster === c).length;

      // 교차점 선택
      const opt1 = document.createElement('option');
      opt1.value = c;
      opt1.textContent = `${c}: ${label.substring(0, 20)}`;
      intersect1.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = c;
      opt2.textContent = `${c}: ${label.substring(0, 20)}`;
      intersect2.appendChild(opt2);

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
        render(currentFiltered);
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
  const minYear = parseInt(document.getElementById('minYear').value) || 0;
  const minVenue = parseFloat(document.getElementById('minVenue').value) || 0;
  const papersOnly = document.getElementById('papersOnly').checked;
  const tagFilter = document.getElementById('tagFilter').value;
  const searchFilter = document.getElementById('searchFilter').value.toLowerCase().trim();

  return allPapers.filter(p => {
    // Default: only show papers with notes
    if (!p.has_notes) return false;
    if (p.year && p.year < minYear) return false;
    if (p.venue_quality < minVenue) return false;
    if (papersOnly && !p.is_paper) return false;
    if (tagFilter) {
      const paperTags = (p.tags || '').split(/[;,]/).map(t => t.trim().toLowerCase());
      if (!paperTags.includes(tagFilter.toLowerCase())) return false;
    }
    if (searchFilter) {
      const searchText = `${p.title} ${p.authors || ''} ${p.abstract} ${p.notes || ''}`.toLowerCase();
      if (!searchText.includes(searchFilter)) return false;
    }
    return true;
  });
}

function updateStats(papers) {
  const paperCount = papers.filter(p => p.is_paper).length;
  const appCount = papers.filter(p => !p.is_paper).length;
  document.getElementById('stats').textContent =
    `${papers.length} items (${paperCount} papers, ${appCount} apps/services)`;
}
