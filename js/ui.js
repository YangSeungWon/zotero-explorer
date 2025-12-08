/* ===========================================
   UI Event Handlers & Utilities
   =========================================== */

// Cluster stats tooltip
let statsTooltip = null;

function showClusterStats(clusterId, event) {
  if (statsTooltip) {
    statsTooltip.remove();
    statsTooltip = null;
  }

  const papers = allPapers.filter(p => p.cluster === clusterId);
  if (papers.length === 0) return;

  const years = papers.map(p => p.year).filter(y => y);
  const citations = papers.map(p => p.citation_count).filter(c => c !== null && c !== undefined);
  const venues = {};
  papers.forEach(p => {
    if (p.venue) {
      const v = p.venue.substring(0, 30);
      venues[v] = (venues[v] || 0) + 1;
    }
  });
  const topVenues = Object.entries(venues).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const minYear = years.length ? Math.min(...years) : 'N/A';
  const maxYear = years.length ? Math.max(...years) : 'N/A';
  const avgYear = years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : 'N/A';
  const avgCitations = citations.length ? Math.round(citations.reduce((a, b) => a + b, 0) / citations.length) : 'N/A';
  const maxCitations = citations.length ? Math.max(...citations) : 'N/A';
  const withNotes = papers.filter(p => p.has_notes).length;

  statsTooltip = document.createElement('div');
  statsTooltip.className = 'cluster-stats-tooltip';
  statsTooltip.innerHTML = `
    <h4>📊 Cluster ${clusterId}: ${clusterLabels[clusterId] || ''}</h4>
    <div class="stat-row"><span class="stat-label">Papers</span><span class="stat-value">${papers.length}</span></div>
    <div class="stat-row"><span class="stat-label">Year Range</span><span class="stat-value">${minYear} - ${maxYear}</span></div>
    <div class="stat-row"><span class="stat-label">Avg Year</span><span class="stat-value">${avgYear}</span></div>
    <div class="stat-row"><span class="stat-label">Avg Citations</span><span class="stat-value">${avgCitations}</span></div>
    <div class="stat-row"><span class="stat-label">Max Citations</span><span class="stat-value">${maxCitations}</span></div>
    <div class="stat-row"><span class="stat-label">With Notes</span><span class="stat-value">${withNotes} / ${papers.length}</span></div>
    ${topVenues.length > 0 ? `
      <div class="top-venues">
        <span class="stat-label">Top Venues:</span>
        ${topVenues.map(([v, c]) => `<div class="venue-item">• ${v} (${c})</div>`).join('')}
      </div>
    ` : ''}
  `;

  document.body.appendChild(statsTooltip);

  const rect = event.target.getBoundingClientRect();
  let left = rect.right + 10;
  let top = rect.top;

  if (left + 280 > window.innerWidth) {
    left = rect.left - 290;
  }
  if (top + 300 > window.innerHeight) {
    top = window.innerHeight - 310;
  }

  statsTooltip.style.left = left + 'px';
  statsTooltip.style.top = top + 'px';

  setTimeout(() => {
    document.addEventListener('click', closeStatsTooltip);
  }, 10);
}

function closeStatsTooltip(e) {
  if (statsTooltip && !statsTooltip.contains(e.target)) {
    statsTooltip.remove();
    statsTooltip = null;
    document.removeEventListener('click', closeStatsTooltip);
  }
}

// Intersection finding
function findIntersectionPapers(cluster1, cluster2, threshold = 0.3) {
  const c1 = clusterCentroids[cluster1];
  const c2 = clusterCentroids[cluster2];

  if (!c1 || !c2) {
    const c1Papers = allPapers.filter(p => p.cluster === cluster1);
    const c2Papers = allPapers.filter(p => p.cluster === cluster2);

    const centroid1 = {
      x: c1Papers.reduce((s, p) => s + p.x, 0) / c1Papers.length,
      y: c1Papers.reduce((s, p) => s + p.y, 0) / c1Papers.length
    };
    const centroid2 = {
      x: c2Papers.reduce((s, p) => s + p.x, 0) / c2Papers.length,
      y: c2Papers.reduce((s, p) => s + p.y, 0) / c2Papers.length
    };

    return findPapersNearBothCentroids(centroid1, centroid2, threshold);
  }

  return findPapersNearBothCentroids(c1, c2, threshold);
}

function findPapersNearBothCentroids(c1, c2, threshold) {
  const distBetween = Math.sqrt(Math.pow(c2.x - c1.x, 2) + Math.pow(c2.y - c1.y, 2));

  return allPapers
    .map(p => {
      const d1 = Math.sqrt(Math.pow(p.x - c1.x, 2) + Math.pow(p.y - c1.y, 2));
      const d2 = Math.sqrt(Math.pow(p.x - c2.x, 2) + Math.pow(p.y - c2.y, 2));
      const ratio = (d1 + d2) / distBetween;
      return { ...p, intersectionScore: ratio, d1, d2 };
    })
    .filter(p => p.intersectionScore <= 1 + threshold)
    .sort((a, b) => a.intersectionScore - b.intersectionScore);
}

// Filter status
const filterStatus = document.getElementById('filterStatus');
let statusTimer = null;

function showFilterStatus(status) {
  filterStatus.className = 'filter-status ' + status;
  filterStatus.textContent = status === 'updating' ? '⏳' : '✓';

  if (status === 'done') {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      filterStatus.className = 'filter-status';
      filterStatus.textContent = '';
    }, 800);
  }
}

// Apply filters
function applyFilters() {
  currentFiltered = filterPapers();
  render(currentFiltered);
  updateStats(currentFiltered);
  showFilterStatus('done');

  // 검색 결과 없음 메시지
  showNoResultsMessage(currentFiltered.length === 0 && allPapers.length > 0);
}

function showNoResultsMessage(show) {
  let overlay = document.getElementById('noResultsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'noResultsOverlay';
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 20px 40px;
      border-radius: 12px;
      font-size: 16px;
      pointer-events: none;
      z-index: 100;
      display: none;
    `;
    overlay.textContent = 'No results found';
    document.getElementById('plot').appendChild(overlay);
  }
  overlay.style.display = show ? 'block' : 'none';
}

// Debounce
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    showFilterStatus('updating');
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Theme
function applyTheme(theme) {
  const html = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  if (theme === 'auto') {
    html.dataset.theme = systemDark.matches ? '' : 'light';
    themeToggle.textContent = '🔄';
    themeToggle.title = 'Theme: Auto (System)';
  } else if (theme === 'light') {
    html.dataset.theme = 'light';
    themeToggle.textContent = '☀️';
    themeToggle.title = 'Theme: Light';
  } else {
    html.dataset.theme = '';
    themeToggle.textContent = '🌙';
    themeToggle.title = 'Theme: Dark';
  }
}

// Initialize UI event handlers
function initUIHandlers() {
  const debouncedApplyFilters = debounce(applyFilters, 200);

  // Filter handlers
  document.getElementById('minYear').addEventListener('change', applyFilters);
  document.getElementById('minVenue').addEventListener('change', applyFilters);
  document.getElementById('papersOnly').addEventListener('change', applyFilters);
  document.getElementById('bookmarkedOnly').addEventListener('change', applyFilters);
  document.getElementById('tagFilter').addEventListener('change', applyFilters);
  document.getElementById('searchFilter').addEventListener('input', debouncedApplyFilters);

  // Reset
  document.getElementById('resetFilter').addEventListener('click', () => {
    document.getElementById('minYear').value = '1990';
    document.getElementById('minVenue').value = '0';
    document.getElementById('papersOnly').checked = false;
    document.getElementById('bookmarkedOnly').checked = false;
    document.getElementById('tagFilter').value = '';
    document.getElementById('searchFilter').value = '';
    document.getElementById('intersectCluster1').value = '';
    document.getElementById('intersectCluster2').value = '';
    document.getElementById('showCitations').checked = true;
    showCitations = true;
    highlightCluster = null;
    filterMode = 'highlight';
    document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
    document.querySelector('.mode-option[data-mode="highlight"]').classList.add('active');
    document.querySelectorAll('.cluster-item').forEach(el => el.classList.remove('active'));
    selectedPaper = null;
    connectedPapers = new Set();
    document.getElementById('detailPanel').classList.remove('active');
    currentFiltered = [...allPapers];
    render(currentFiltered);
    updateStats(currentFiltered);
  });

  // Citations toggle
  document.getElementById('showCitations').addEventListener('change', (e) => {
    showCitations = e.target.checked;
    render(currentFiltered);
  });

  // Mode toggle
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.addEventListener('click', () => {
      filterMode = opt.dataset.mode;
      document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      render(currentFiltered);
    });
  });
  document.querySelector(`.mode-option[data-mode="${filterMode}"]`).classList.add('active');

  // Intersection finder
  document.getElementById('findIntersection').addEventListener('click', () => {
    const c1 = document.getElementById('intersectCluster1').value;
    const c2 = document.getElementById('intersectCluster2').value;

    if (!c1 || !c2) {
      alert('Please select two clusters');
      return;
    }
    if (c1 === c2) {
      alert('Please select different clusters');
      return;
    }

    const intersectionPapers = findIntersectionPapers(parseInt(c1), parseInt(c2));
    if (intersectionPapers.length === 0) {
      alert('No intersection papers found');
      return;
    }

    currentFiltered = intersectionPapers;
    render(currentFiltered);
    updateStats(currentFiltered);
    document.getElementById('stats').textContent += ` | Intersection: C${c1} ↔ C${c2}`;
  });

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  themeToggle.addEventListener('click', () => {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    let nextTheme;
    if (savedTheme === 'auto') nextTheme = 'dark';
    else if (savedTheme === 'dark') nextTheme = 'light';
    else nextTheme = 'auto';

    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
    render(currentFiltered);
  });

  systemDark.addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'auto') {
      applyTheme('auto');
      render(currentFiltered);
    }
  });

  const savedTheme = localStorage.getItem('theme') || 'auto';
  applyTheme(savedTheme);

  // Close detail panel
  document.getElementById('closeDetail').addEventListener('click', clearSelection);

  // Cluster panel collapse
  const clusterPanel = document.getElementById('clusterPanel');
  if (localStorage.getItem('clusterCollapsed') === 'true') {
    clusterPanel.classList.add('collapsed');
  }

  document.getElementById('collapseCluster').addEventListener('click', () => {
    clusterPanel.classList.toggle('collapsed');
    localStorage.setItem('clusterCollapsed', clusterPanel.classList.contains('collapsed'));
    setTimeout(() => Plotly.Plots.resize('plot'), 250);
  });

  // Detail panel resize
  const resizeHandle = document.getElementById('resizeHandle');
  const detailPanel = document.getElementById('detailPanel');
  let isResizing = false;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 250 && newWidth <= 600) {
      detailPanel.style.width = newWidth + 'px';
      Plotly.Plots.resize('plot');
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('detailPanelWidth', detailPanel.style.width);
    }
  });

  // Missing papers modal
  const missingModal = document.getElementById('missingModal');
  const missingList = document.getElementById('missingList');

  // Copy clusters
  document.getElementById('copyClusters').addEventListener('click', async () => {
    const clusters = [...new Set(allPapers.map(p => p.cluster))].sort((a, b) => a - b);
    let text = `# Paper Library Cluster Structure\n`;
    text += `Total: ${allPapers.length} papers, ${clusters.length} clusters\n\n`;

    clusters.forEach(c => {
      const clusterPapers = allPapers.filter(p => p.cluster === c);
      const label = clusterLabels[c] || `Cluster ${c}`;
      text += `## Cluster ${c}: ${label} (${clusterPapers.length} papers)\n`;
      clusterPapers.forEach(p => {
        const year = p.year || 'N/A';
        const venue = p.venue ? ` - ${p.venue.substring(0, 30)}` : '';
        text += `- ${p.title} (${year})${venue}\n`;
      });
      text += '\n';
    });

    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('copyClusters');
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
  });

  // Copy filtered
  document.getElementById('copyFiltered').addEventListener('click', async () => {
    const papers = currentFiltered;
    let text = `# Paper List (${papers.length} papers)\n\n`;

    papers.forEach((p, i) => {
      text += `## ${i + 1}. ${p.title}\n`;
      text += `- **Year**: ${p.year || 'N/A'}\n`;
      text += `- **Authors**: ${p.authors || 'N/A'}\n`;
      text += `- **Venue**: ${p.venue || 'N/A'}\n`;
      text += `- **Cluster**: ${p.cluster} (${clusterLabels[p.cluster] || ''})\n`;
      if (p.citation_count) text += `- **Citations**: ${p.citation_count}\n`;
      if (p.doi) text += `- **DOI**: ${p.doi}\n`;
      if (p.tags && p.tags !== 'nan') text += `- **Tags**: ${p.tags}\n`;
      if (p.abstract) text += `\n**Abstract**:\n${p.abstract}\n`;
      if (p.notes) text += `\n**Notes**:\n${p.notes}\n`;
      text += '\n---\n\n';
    });

    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('copyFiltered');
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
  });

  // Global stats
  document.getElementById('showGlobalStats').addEventListener('click', () => {
    const papers = allPapers.filter(p => p.is_paper);
    const apps = allPapers.filter(p => !p.is_paper);
    const years = papers.map(p => p.year).filter(y => y);
    const citations = papers.map(p => p.citation_count).filter(c => c !== null && c !== undefined);
    const withNotes = allPapers.filter(p => p.has_notes).length;

    let html = '<h4 style="font-size: 14px; margin-bottom: 12px;">📈 Library Statistics</h4>';

    if (dataMeta.csv_updated || dataMeta.map_built) {
      html += '<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">';
      if (dataMeta.csv_updated) html += `📁 CSV: ${dataMeta.csv_updated}<br>`;
      if (dataMeta.map_built) html += `🗺️ Map: ${dataMeta.map_built}`;
      html += '</div>';
    }

    html += `
      <div class="missing-item" style="border-bottom: 1px solid var(--border-color);">
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Total Items</span><strong>${allPapers.length}</strong></div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Papers</span><strong>${papers.length}</strong></div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Apps/Services</span><strong>${apps.length}</strong></div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>With Notes</span><strong>${withNotes} (${Math.round(withNotes/allPapers.length*100)}%)</strong></div>
        </div>
      </div>`;

    if (years.length > 0) {
      html += `
        <div class="missing-item" style="border-bottom: 1px solid var(--border-color);">
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 6px;">📅 Years</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Range</span><strong>${Math.min(...years)} - ${Math.max(...years)}</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Average</span><strong>${Math.round(years.reduce((a,b)=>a+b,0)/years.length)}</strong></div>
          </div>
        </div>`;
    }

    if (citations.length > 0) {
      const totalCitations = citations.reduce((a,b) => a+b, 0);
      html += `
        <div class="missing-item" style="border-bottom: 1px solid var(--border-color);">
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 6px;">📊 Citations</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Total</span><strong>${totalCitations.toLocaleString()}</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Average</span><strong>${Math.round(totalCitations/citations.length)}</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Max</span><strong>${Math.max(...citations).toLocaleString()}</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Papers with data</span><strong>${citations.length} / ${papers.length}</strong></div>
          </div>
        </div>`;
    }

    html += `
      <div class="missing-item">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 6px;">🔗 Internal Links</div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Citation Links</span><strong>${citationLinks.length}</strong></div>
        </div>
      </div>`;

    missingList.innerHTML = html;
    missingModal.classList.add('active');
  });

  // Classics
  document.getElementById('showClassics').addEventListener('click', () => {
    let papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
    if (highlightCluster !== null) {
      papers = papers.filter(p => p.cluster === highlightCluster);
    }
    const isFiltered = papers.length < allPapers.length;
    const myS2Ids = new Set(allPapers.map(p => p.s2_id).filter(Boolean));
    const myDOIs = new Set(allPapers.map(p => (p.doi || '').toLowerCase()).filter(Boolean));
    const classicCounts = {};

    papers.forEach(p => {
      (p.references || []).forEach(refId => {
        if (!myS2Ids.has(refId)) {
          classicCounts[`s2:${refId}`] = (classicCounts[`s2:${refId}`] || 0) + 1;
        }
      });
      (p.cr_references || []).forEach(refDoi => {
        if (refDoi && !myDOIs.has(refDoi.toLowerCase())) {
          classicCounts[`doi:${refDoi}`] = (classicCounts[`doi:${refDoi}`] || 0) + 1;
        }
      });
    });

    const sorted = Object.entries(classicCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);

    let html = '<h4 style="color: #58a6ff; font-size: 14px; margin-bottom: 12px;">📚 Classics</h4>';
    const scope = isFiltered ? `${papers.length} filtered papers` : 'All papers';
    html += `<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Foundational papers frequently cited by ${scope.toLowerCase()}</p>`;

    if (sorted.length > 0) {
      // Use cached reference data
      const refCache = typeof referenceCache !== 'undefined' ? referenceCache : {};

      html += sorted.map(([key, count], i) => {
        const type = key.substring(0, key.indexOf(':'));
        const id = key.substring(key.indexOf(':') + 1);
        const url = type === 's2' ? `https://www.semanticscholar.org/paper/${id}` : `https://doi.org/${id}`;
        const details = refCache[id];
        const title = details?.title || (type === 's2' ? 'Semantic Scholar →' : id.substring(0, 40) + (id.length > 40 ? '...' : ''));
        const totalCites = details?.citations;
        const citeInfo = totalCites !== undefined
          ? `<span class="missing-count">Cited by ${count} papers</span> <span style="color: var(--text-muted); font-size: 10px;">(${totalCites.toLocaleString()} total)</span>`
          : `<span class="missing-count">Cited by ${count} papers</span>`;
        return `<div class="missing-item"><div class="missing-rank">${i + 1}</div><div class="missing-info">${citeInfo}<br><a class="missing-link" href="${url}" target="_blank" title="${title}">${title.length > 60 ? title.substring(0, 60) + '...' : title}</a></div></div>`;
      }).join('');
      missingList.innerHTML = html;
      missingModal.classList.add('active');
    } else {
      html += '<p style="color: var(--text-muted);">No classics found</p>';
      missingList.innerHTML = html;
      missingModal.classList.add('active');
    }
  });

  // New Work
  document.getElementById('showNewWork').addEventListener('click', () => {
    let papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
    if (highlightCluster !== null) {
      papers = papers.filter(p => p.cluster === highlightCluster);
    }
    const isFiltered = papers.length < allPapers.length;
    const myS2Ids = new Set(allPapers.map(p => p.s2_id).filter(Boolean));
    const newWorkCounts = {};

    papers.forEach(p => {
      (p.citations || []).forEach(citeId => {
        if (!myS2Ids.has(citeId)) {
          newWorkCounts[citeId] = (newWorkCounts[citeId] || 0) + 1;
        }
      });
    });

    const sorted = Object.entries(newWorkCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);

    let html = '<h4 style="color: #f97316; font-size: 14px; margin-bottom: 12px;">🆕 New Work</h4>';
    const scope2 = isFiltered ? `${papers.length} filtered papers` : 'all papers';
    html += `<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Recent papers that cite ${scope2}</p>`;

    if (sorted.length > 0) {
      html += sorted.map(([s2Id, count], i) => `
        <div class="missing-item"><div class="missing-rank">${i + 1}</div><div class="missing-info"><span class="missing-count" style="background: #f9731633; color: #f97316;">Cites ${count} papers</span><br><a class="missing-link" href="https://www.semanticscholar.org/paper/${s2Id}" target="_blank">Semantic Scholar →</a></div></div>
      `).join('');
    } else {
      html += '<p style="color: var(--text-muted);">No new work found (S2 citations data needed)</p>';
    }

    missingList.innerHTML = html;
    missingModal.classList.add('active');
  });

  // Modal close
  document.getElementById('closeMissing').addEventListener('click', () => {
    missingModal.classList.remove('active');
  });

  missingModal.addEventListener('click', (e) => {
    if (e.target === missingModal) {
      missingModal.classList.remove('active');
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if (missingModal.classList.contains('active')) {
          missingModal.classList.remove('active');
        } else if (statsTooltip) {
          statsTooltip.remove();
          statsTooltip = null;
        } else if (selectedPaper) {
          clearSelection();
        }
        break;

      case '/':
        e.preventDefault();
        document.getElementById('searchFilter').focus();
        break;

      case 'j':
      case 'J':
        if (selectedPaper && currentFiltered.length > 0) {
          const currentIdx = currentFiltered.findIndex(p => p.id === selectedPaper.id);
          const nextIdx = (currentIdx + 1) % currentFiltered.length;
          showDetail(currentFiltered[nextIdx]);
        } else if (currentFiltered.length > 0) {
          showDetail(currentFiltered[0]);
        }
        break;

      case 'k':
      case 'K':
        if (selectedPaper && currentFiltered.length > 0) {
          const currentIdx = currentFiltered.findIndex(p => p.id === selectedPaper.id);
          const prevIdx = (currentIdx - 1 + currentFiltered.length) % currentFiltered.length;
          showDetail(currentFiltered[prevIdx]);
        } else if (currentFiltered.length > 0) {
          showDetail(currentFiltered[currentFiltered.length - 1]);
        }
        break;

      case 'r':
      case 'R':
        if (!e.ctrlKey && !e.metaKey) {
          document.getElementById('resetFilter').click();
        }
        break;

      case 'c':
      case 'C':
        if (!e.ctrlKey && !e.metaKey) {
          const checkbox = document.getElementById('showCitations');
          checkbox.checked = !checkbox.checked;
          showCitations = checkbox.checked;
          render(currentFiltered);
        }
        break;

      case '?':
        alert(`⌨️ Keyboard Shortcuts

/     Focus search
Esc   Deselect / Close modal
J     Next paper
K     Previous paper
R     Reset filters
C     Toggle citation lines
?     This help

🖱️ Mouse
Hover   Preview paper & citation lines`);
        break;
    }
  });
}
