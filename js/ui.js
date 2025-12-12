/* ===========================================
   UI Event Handlers & Utilities
   =========================================== */

// Toast notification
let toastTimer = null;
function showToast(title, preview) {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.log('Copied:', title);
    return;
  }
  const titleEl = toast.querySelector('.toast-title');
  const previewEl = document.getElementById('toastPreview');

  if (titleEl) titleEl.textContent = title;
  if (previewEl) previewEl.textContent = preview.substring(0, 200) + (preview.length > 200 ? '...' : '');

  clearTimeout(toastTimer);
  toast.classList.add('show');

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, TOAST_TIMEOUT);
}

// Sync Panel
let syncPollingInterval = null;

function initSyncPanel() {
  const syncPanel = document.getElementById('syncPanel');
  const collapseBtn = document.getElementById('collapseSyncPanel');
  const syncFullBtn = document.getElementById('syncFullBtn');
  const syncClustersBtn = document.getElementById('syncClustersBtn');
  const syncBatchTagsBtn = document.getElementById('syncBatchTagsBtn');
  const syncCitationsBtn = document.getElementById('syncCitationsBtn');

  // Collapse toggle
  collapseBtn?.addEventListener('click', () => {
    syncPanel.classList.toggle('collapsed');
  });

  // Full Sync button
  syncFullBtn?.addEventListener('click', () => {
    startFullSync();
  });

  // Sync Clusters button
  syncClustersBtn?.addEventListener('click', () => {
    syncClusterTagsFromPanel();
  });

  // Batch Tags button
  syncBatchTagsBtn?.addEventListener('click', () => {
    document.getElementById('batchTagModal').classList.add('active');
  });

  // Citations Sync button
  syncCitationsBtn?.addEventListener('click', () => {
    startCitationsSync();
  });

  // Check initial sync status
  checkSyncStatus();
}

function addSyncLog(message, type = 'info') {
  const syncLog = document.getElementById('syncLog');
  if (!syncLog) return;

  // Remove placeholder
  const placeholder = syncLog.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const item = document.createElement('div');
  item.className = `sync-log-item ${type}`;
  item.innerHTML = `<span class="time">${time}</span>${message}`;

  syncLog.insertBefore(item, syncLog.firstChild);

  // Keep only last 10 items
  while (syncLog.children.length > 10) {
    syncLog.removeChild(syncLog.lastChild);
  }
}

function updateSyncStatus(status, text) {
  const indicator = document.getElementById('syncIndicator');
  const statusText = document.getElementById('syncStatusText');

  if (indicator) {
    indicator.className = `sync-status-indicator ${status}`;
  }
  if (statusText) {
    statusText.textContent = text;
  }

  // Disable/enable buttons
  const btns = document.querySelectorAll('.sync-btn');
  btns.forEach(btn => {
    btn.disabled = status === 'running';
  });
}

function updateLastRun(timestamp) {
  const lastRunEl = document.getElementById('syncLastRun');
  if (!lastRunEl || !timestamp) return;

  const date = new Date(timestamp);
  const timeStr = date.toLocaleString('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  lastRunEl.textContent = `Last: ${timeStr}`;
}

async function checkSyncStatus() {
  try {
    const resp = await fetch('/api/sync-status');
    const data = await resp.json();

    if (data.running) {
      updateSyncStatus('running', 'Syncing...');
      startSyncPolling();
    } else if (data.error) {
      updateSyncStatus('error', 'Error');
    } else if (data.last_result) {
      updateSyncStatus('success', 'Complete');
    }

    if (data.last_run) {
      updateLastRun(data.last_run);
    }
  } catch (e) {
    console.error('Failed to check sync status:', e);
  }
}

const STEP_NAMES = {
  1: 'Building',
  2: 'Loading',
  3: 'Clusters',
  4: 'Reviews'
};

let lastStepDetail = null;

function startSyncPolling() {
  if (syncPollingInterval) return;

  syncPollingInterval = setInterval(async () => {
    try {
      const resp = await fetch('/api/sync-status');
      const data = await resp.json();

      if (data.running) {
        // Show detailed progress
        const step = data.current_step;
        const detail = data.step_detail;
        const progress = data.progress;

        let statusText = 'Syncing...';
        if (step && STEP_NAMES[step]) {
          statusText = `Step ${step}/4: ${STEP_NAMES[step]}`;
        }

        // Update status text with step info
        updateSyncStatus('running', statusText);

        // Log new step details (avoid duplicates)
        if (detail && detail !== lastStepDetail) {
          addSyncLog(detail);
          lastStepDetail = detail;
        }
      } else {
        clearInterval(syncPollingInterval);
        syncPollingInterval = null;
        lastStepDetail = null;

        if (data.error) {
          updateSyncStatus('error', 'Error');
          addSyncLog(`Error: ${data.error}`, 'error');
        } else if (data.last_result) {
          updateSyncStatus('success', 'Complete');
          const r = data.last_result;
          if (r.build) {
            addSyncLog(`Built ${r.build.papers} papers, ${r.build.clusters} clusters`, 'success');
          }
          if (r.cluster_sync) {
            addSyncLog(`Clusters: ${r.cluster_sync.success} synced`, 'success');
          }
          if (r.review_sync && r.review_sync.success > 0) {
            addSyncLog(`Reviews: ${r.review_sync.success} tagged`, 'success');
          }
          addSyncLog('Full Sync completed', 'success');

          // Reload page after sync
          setTimeout(() => {
            location.reload();
          }, 2000);
        }

        if (data.last_run) {
          updateLastRun(data.last_run);
        }
      }
    } catch (e) {
      console.error('Polling error:', e);
    }
  }, 1000);  // Poll every 1 second for more responsive feedback
}

async function startFullSync() {
  updateSyncStatus('running', 'Starting...');
  addSyncLog('Starting Full Sync...');

  try {
    const data = await apiCall('/full-sync', { method: 'POST' });

    if (data.status === 'started') {
      addSyncLog('Fetching from Zotero API...');
      startSyncPolling();
    } else if (data.error) {
      updateSyncStatus('error', 'Error');
      addSyncLog(data.error, 'error');
    }
  } catch (e) {
    updateSyncStatus('error', 'Error');
    addSyncLog(`Error: ${e.message}`, 'error');
  }
}

async function startCitationsSync() {
  updateSyncStatus('running', 'Starting...');
  addSyncLog('Starting Citations Sync...');

  try {
    const data = await apiCall('/citations-sync', { method: 'POST' });

    if (data.status === 'started') {
      addSyncLog('Fetching from Semantic Scholar...');
      startSyncPolling();
    } else if (data.status === 'already_running') {
      addSyncLog('Sync already in progress');
      startSyncPolling();
    } else if (data.error) {
      updateSyncStatus('error', 'Error');
      addSyncLog(data.error, 'error');
    }
  } catch (e) {
    updateSyncStatus('error', 'Error');
    addSyncLog(`Error: ${e.message}`, 'error');
  }
}

async function syncClusterTagsFromPanel() {
  updateSyncStatus('running', 'Starting...');
  addSyncLog('Starting Cluster Sync...');

  try {
    const data = await apiCall('/cluster-sync', { method: 'POST' });

    if (data.status === 'started') {
      addSyncLog('Fetching Zotero items...');
      startSyncPolling();
    } else if (data.status === 'already_running') {
      addSyncLog('Sync already in progress');
      startSyncPolling();
    } else if (data.error) {
      updateSyncStatus('error', 'Error');
      addSyncLog(data.error, 'error');
    }
  } catch (e) {
    updateSyncStatus('error', 'Error');
    addSyncLog(`Error: ${e.message}`, 'error');
  }
}

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
    <h4><i data-lucide="bar-chart-2"></i> Cluster ${clusterId}: ${clusterLabels[clusterId] || ''}</h4>
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

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

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

// Filter status
const filterStatus = document.getElementById('filterStatus');
let statusTimer = null;

function showFilterStatus(status) {
  filterStatus.className = 'filter-status ' + status;
  filterStatus.innerHTML = status === 'updating'
    ? '<i data-lucide="loader" class="spin"></i>'
    : '<i data-lucide="check"></i>';
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  if (status === 'done') {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      filterStatus.className = 'filter-status';
      filterStatus.textContent = '';
    }, FILTER_STATUS_TIMEOUT);
  }
}

// Apply filters
function applyFilters() {
  currentFiltered = filterPapers();
  if (currentView === 'map') {
    render(currentFiltered);
  } else if (currentView === 'list') {
    renderListView(currentFiltered);
  } else {
    renderTimeline(currentFiltered);
  }
  updateStats(currentFiltered);
  updateFilterChips();
  showFilterStatus('done');

  // Update default panel if no paper selected
  if (selectedPaper === null && typeof showDefaultPanel === 'function') {
    showDefaultPanel();
  }

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

  let icon;
  if (theme === 'auto') {
    html.dataset.theme = systemDark.matches ? '' : 'light';
    icon = 'sun-moon';
    themeToggle.title = 'Theme: Auto';
  } else if (theme === 'light') {
    html.dataset.theme = 'light';
    icon = 'sun';
    themeToggle.title = 'Theme: Light';
  } else {
    html.dataset.theme = '';
    icon = 'moon';
    themeToggle.title = 'Theme: Dark';
  }

  themeToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Semantic search function
async function performSemanticSearch(query) {
  const toggle = document.getElementById('semanticToggle');
  toggle.classList.add('loading');

  try {
    const resp = await fetch(`/api/semantic-search?q=${encodeURIComponent(query)}&top_k=50`);
    const data = await resp.json();

    if (data.error) {
      console.error('Semantic search error:', data.error);
      showToast('Search Error', data.error);
      return null;
    }

    return data.results;
  } catch (e) {
    console.error('Semantic search failed:', e);
    showToast('Search Error', e.message);
    return null;
  } finally {
    toggle.classList.remove('loading');
  }
}

// Initialize UI event handlers
function initUIHandlers() {
  initFilterHandlers();
  initViewHandlers();
  initThemeHandlers();
  initPanelHandlers();
  initExportHandlers();
  initStatsModals();
  initKeyboardShortcuts();
  initDropdownHandlers();
  initSyncModalHandlers();
  initBatchTagHandlers();
}

// ============================================================
// Filter Handlers
// ============================================================
function initFilterHandlers() {
  const debouncedApplyFilters = debounce(applyFilters, DEBOUNCE_DELAY);

  const debouncedSemanticSearch = debounce(async () => {
    const query = document.getElementById('searchFilter').value.trim();
    if (!semanticSearchMode || !query) {
      semanticSearchResults = null;
      applyFilters();
      return;
    }
    const results = await performSemanticSearch(query);
    if (results) {
      semanticSearchResults = new Map(results.map(r => [r.id, r.similarity]));
      // Auto-switch to similarity sort when semantic search has results
      if (typeof listSortBy !== 'undefined') {
        listSortBy = 'similarity';
        const sortSelect = document.getElementById('listSortBy');
        if (sortSelect) sortSelect.value = 'similarity';
      }
      applyFilters();
    }
  }, SEMANTIC_SEARCH_DEBOUNCE);

  document.getElementById('minVenue').addEventListener('change', applyFilters);
  document.getElementById('papersOnly').addEventListener('change', applyFilters);
  document.getElementById('bookmarkedOnly').addEventListener('change', applyFilters);
  document.getElementById('tagFilter').addEventListener('change', applyFilters);
  document.getElementById('searchFilter').addEventListener('input', () => {
    if (semanticSearchMode) {
      showFilterStatus('updating');
      debouncedSemanticSearch();
    } else {
      debouncedApplyFilters();
    }
  });

  // Semantic search toggle
  const semanticToggle = document.getElementById('semanticToggle');
  semanticToggle.addEventListener('click', () => {
    semanticSearchMode = !semanticSearchMode;
    semanticToggle.classList.toggle('active', semanticSearchMode);
    semanticToggle.title = semanticSearchMode ? 'Semantic search ON (AI-powered)' : 'Toggle semantic search (AI-powered)';

    const searchInput = document.getElementById('searchFilter');
    searchInput.placeholder = semanticSearchMode ? 'Describe what you\'re looking for...' : 'Title/Author/Abstract';

    const query = searchInput.value.trim();
    if (query) {
      if (semanticSearchMode) {
        debouncedSemanticSearch();
      } else {
        semanticSearchResults = null;
        // Revert to year-desc when turning off semantic search
        if (typeof listSortBy !== 'undefined' && listSortBy === 'similarity') {
          listSortBy = 'year-desc';
          const sortSelect = document.getElementById('listSortBy');
          if (sortSelect) sortSelect.value = 'year-desc';
        }
        applyFilters();
      }
    }
  });

  // Reset
  document.getElementById('resetFilter').addEventListener('click', resetAllFilters);

  // Citations toggle
  document.getElementById('showCitations').addEventListener('change', (e) => {
    showCitations = e.target.checked;
    render(currentFiltered);
  });
}

function resetAllFilters() {
  document.getElementById('minVenue').value = '0';
  document.getElementById('papersOnly').checked = false;
  document.getElementById('bookmarkedOnly').checked = false;
  document.getElementById('tagFilter').value = '';
  document.getElementById('searchFilter').value = '';
  document.getElementById('searchFilter').placeholder = 'Title/Author/Abstract';
  document.getElementById('showCitations').checked = true;
  showCitations = true;
  highlightCluster = null;
  semanticSearchMode = false;
  semanticSearchResults = null;
  document.getElementById('semanticToggle').classList.remove('active');
  document.querySelectorAll('.cluster-item').forEach(el => el.classList.remove('active'));
  selectedPaper = null;
  connectedPapers = new Set();
  yearRange = null;
  const brushSelection = document.getElementById('brushSelection');
  if (brushSelection) brushSelection.classList.remove('active');
  document.getElementById('detailPanel').classList.remove('active');
  currentFiltered = [...allPapers];
  if (currentView === 'map') {
    render(currentFiltered);
  } else {
    renderTimeline(currentFiltered);
  }
  if (typeof renderMiniTimeline === 'function') {
    renderMiniTimeline(allPapers);
  }
  updateStats(currentFiltered);
  updateFilterChips();
}

// ============================================================
// View Handlers
// ============================================================
function initViewHandlers() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  const miniTimelineToggle = document.getElementById('toggleMiniTimeline');
  if (miniTimelineToggle) {
    miniTimelineToggle.addEventListener('click', () => {
      document.getElementById('miniTimeline').classList.toggle('collapsed');
    });
  }
}

// ============================================================
// Theme Handlers
// ============================================================
function initThemeHandlers() {
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
    renderCurrentView();
  });

  systemDark.addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'auto') {
      applyTheme('auto');
      renderCurrentView();
    }
  });

  applyTheme(localStorage.getItem('theme') || 'auto');
}

// ============================================================
// Panel Handlers (sidebar, detail panel, resize)
// ============================================================
function initPanelHandlers() {
  document.getElementById('closeDetail').addEventListener('click', clearSelection);

  // Left sidebar collapse
  const leftSidebar = document.getElementById('leftSidebar');
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    leftSidebar.classList.add('collapsed');
  }

  document.getElementById('collapseCluster').addEventListener('click', () => {
    leftSidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', leftSidebar.classList.contains('collapsed'));
    setTimeout(() => Plotly.Plots.resize('plot'), 250);
  });

  initDetailPanelResize();
  initMiniTimelineResize();
}

function initDetailPanelResize() {
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
    if (newWidth >= DETAIL_PANEL_MIN_WIDTH && newWidth <= DETAIL_PANEL_MAX_WIDTH) {
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
}

function initMiniTimelineResize() {
  const miniTimelineResize = document.getElementById('miniTimelineResize');
  const miniTimelineContent = document.querySelector('.mini-timeline-content');
  let isResizingTimeline = false;

  if (!miniTimelineResize || !miniTimelineContent) return;

  const savedHeight = localStorage.getItem('miniTimelineHeight');
  if (savedHeight) {
    miniTimelineContent.style.height = savedHeight;
  }

  miniTimelineResize.addEventListener('mousedown', (e) => {
    isResizingTimeline = true;
    miniTimelineResize.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizingTimeline) return;
    const containerRect = document.querySelector('.plot-container').getBoundingClientRect();
    const newHeight = containerRect.bottom - e.clientY - 28;
    if (newHeight >= MINI_TIMELINE_MIN_HEIGHT && newHeight <= MINI_TIMELINE_MAX_HEIGHT) {
      miniTimelineContent.style.height = newHeight + 'px';
      renderMiniTimeline(allPapers);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizingTimeline) {
      isResizingTimeline = false;
      miniTimelineResize.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('miniTimelineHeight', miniTimelineContent.style.height);
    }
  });
}

// ============================================================
// Export Handlers
// ============================================================
function initExportHandlers() {
  document.getElementById('copyClusters').addEventListener('click', copyClusterStructure);
  document.getElementById('copyFiltered').addEventListener('click', copyFilteredPapers);
}

async function copyClusterStructure() {
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
    showToast(`Copied ${clusters.length} clusters`, text);
  } catch (e) {
    alert('Copy failed: ' + e.message);
  }
}

async function copyFilteredPapers() {
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
    showToast(`Copied ${papers.length} papers`, text);
  } catch (e) {
    alert('Copy failed: ' + e.message);
  }
}

// ============================================================
// Stats Modals
// ============================================================
function initStatsModals() {
  const missingModal = document.getElementById('missingModal');
  const missingList = document.getElementById('missingList');

  document.getElementById('showGlobalStats').addEventListener('click', () => showGlobalStatsModal(missingModal, missingList));
  document.getElementById('showClassics').addEventListener('click', () => showClassicsModal(missingModal, missingList));
  document.getElementById('showNewWork').addEventListener('click', () => showNewWorkModal(missingModal, missingList));

  document.getElementById('showAuthorStats')?.addEventListener('click', showAuthorStats);
  document.getElementById('closeAuthorStats')?.addEventListener('click', () => {
    document.getElementById('authorStatsModal').classList.remove('active');
  });
  document.getElementById('authorStatsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authorStatsModal') {
      document.getElementById('authorStatsModal').classList.remove('active');
    }
  });

  document.getElementById('closeMissing').addEventListener('click', () => missingModal.classList.remove('active'));
  missingModal.addEventListener('click', (e) => {
    if (e.target === missingModal) missingModal.classList.remove('active');
  });
}

function showGlobalStatsModal(modal, list) {
  const papers = allPapers.filter(p => p.is_paper);
  const apps = allPapers.filter(p => !p.is_paper);
  const years = papers.map(p => p.year).filter(y => y);
  const citations = papers.map(p => p.citation_count).filter(c => c !== null && c !== undefined);
  const withNotes = allPapers.filter(p => p.has_notes).length;

  let html = '<h4 style="font-size: 14px; margin-bottom: 12px;"><i data-lucide="trending-up"></i> Library Statistics</h4>';

  if (dataMeta.csv_updated || dataMeta.map_built) {
    html += '<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">';
    if (dataMeta.csv_updated) html += `<i data-lucide="file"></i> CSV: ${dataMeta.csv_updated}<br>`;
    if (dataMeta.map_built) html += `<i data-lucide="map"></i> Map: ${dataMeta.map_built}`;
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
          <div style="font-weight: 600; margin-bottom: 6px;"><i data-lucide="calendar"></i> Years</div>
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
          <div style="font-weight: 600; margin-bottom: 6px;"><i data-lucide="quote"></i> Citations</div>
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
        <div style="font-weight: 600; margin-bottom: 6px;"><i data-lucide="link"></i> Internal Links</div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Citation Links</span><strong>${citationLinks.length}</strong></div>
      </div>
    </div>`;

  list.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  modal.classList.add('active');
}

function showClassicsModal(modal, list) {
  let papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
  if (highlightCluster !== null) papers = papers.filter(p => p.cluster === highlightCluster);
  const isFiltered = papers.length < allPapers.length;
  const myS2Ids = new Set(allPapers.map(p => p.s2_id).filter(Boolean));
  const myDOIs = new Set(allPapers.map(p => (p.doi || '').toLowerCase()).filter(Boolean));
  const classicCounts = {};

  papers.forEach(p => {
    (p.references || []).forEach(refId => {
      if (!myS2Ids.has(refId)) classicCounts[`s2:${refId}`] = (classicCounts[`s2:${refId}`] || 0) + 1;
    });
    (p.cr_references || []).forEach(refDoi => {
      if (refDoi && !myDOIs.has(refDoi.toLowerCase())) classicCounts[`doi:${refDoi}`] = (classicCounts[`doi:${refDoi}`] || 0) + 1;
    });
  });

  const sorted = Object.entries(classicCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const scope = isFiltered ? `${papers.length} filtered papers` : 'All papers';

  let html = '<h4 style="color: #58a6ff; font-size: 14px; margin-bottom: 12px;"><i data-lucide="book-open"></i> Classics</h4>';
  html += `<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Foundational papers frequently cited by ${scope.toLowerCase()}</p>`;

  if (sorted.length > 0) {
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
  } else {
    html += '<p style="color: var(--text-muted);">No classics found</p>';
  }

  list.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  modal.classList.add('active');
}

function showNewWorkModal(modal, list) {
  let papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
  if (highlightCluster !== null) papers = papers.filter(p => p.cluster === highlightCluster);
  const isFiltered = papers.length < allPapers.length;
  const myS2Ids = new Set(allPapers.map(p => p.s2_id).filter(Boolean));
  const newWorkCounts = {};

  papers.forEach(p => {
    (p.citations || []).forEach(citeId => {
      if (!myS2Ids.has(citeId)) newWorkCounts[citeId] = (newWorkCounts[citeId] || 0) + 1;
    });
  });

  const sorted = Object.entries(newWorkCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const scope = isFiltered ? `${papers.length} filtered papers` : 'all papers';

  let html = '<h4 style="color: #f97316; font-size: 14px; margin-bottom: 12px;"><i data-lucide="sparkles"></i> New Work</h4>';
  html += `<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Recent papers that cite ${scope}</p>`;

  if (sorted.length > 0) {
    html += sorted.map(([s2Id, count], i) => `
      <div class="missing-item"><div class="missing-rank">${i + 1}</div><div class="missing-info"><span class="missing-count" style="background: #f9731633; color: #f97316;">Cites ${count} papers</span><br><a class="missing-link" href="https://www.semanticscholar.org/paper/${s2Id}" target="_blank">Semantic Scholar →</a></div></div>
    `).join('');
  } else {
    html += '<p style="color: var(--text-muted);">No new work found (S2 citations data needed)</p>';
  }

  list.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  modal.classList.add('active');
}

// ============================================================
// Keyboard Shortcuts
// ============================================================
function initKeyboardShortcuts() {
  const missingModal = document.getElementById('missingModal');

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') e.target.blur();
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
        navigatePaper(1);
        break;

      case 'k':
      case 'K':
        navigatePaper(-1);
        break;

      case 'r':
      case 'R':
        if (!e.ctrlKey && !e.metaKey) document.getElementById('resetFilter').click();
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
        alert(`Keyboard Shortcuts

/     Focus search
Esc   Deselect / Close modal
J     Next paper
K     Previous paper
R     Reset filters
C     Toggle citation lines
?     This help

Mouse
Hover   Preview paper & citation lines`);
        break;
    }
  });
}

function navigatePaper(direction) {
  if (currentFiltered.length === 0) return;
  if (selectedPaper) {
    const currentIdx = currentFiltered.findIndex(p => p.id === selectedPaper.id);
    const nextIdx = (currentIdx + direction + currentFiltered.length) % currentFiltered.length;
    showDetail(currentFiltered[nextIdx]);
  } else {
    showDetail(currentFiltered[direction > 0 ? 0 : currentFiltered.length - 1]);
  }
}

// ============================================================
// Dropdown Handlers
// ============================================================
function initDropdownHandlers() {
  document.querySelectorAll('.header-dropdown').forEach(dropdown => {
    const btn = dropdown.querySelector('.header-dropdown-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.header-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.header-dropdown').forEach(d => d.classList.remove('open'));
  });

  document.querySelectorAll('.header-dropdown-item').forEach(item => {
    item.addEventListener('click', () => item.closest('.header-dropdown').classList.remove('open'));
  });
}

// ============================================================
// Sync Modal Handlers
// ============================================================
function initSyncModalHandlers() {
  // Cluster Tag Sync (legacy)
  document.getElementById('syncClusterTags')?.addEventListener('click', async () => {
    const clusterCount = Object.keys(clusterLabels).length;
    const paperCount = allPapers.length;

    if (!confirm(`클러스터 라벨을 Zotero 태그로 동기화합니다.\n\n${clusterCount}개 클러스터, ${paperCount}개 논문\n태그 형식: "cluster: [라벨명]"\n\n계속하시겠습니까?`)) return;

    try {
      showToast('동기화 중...', '클러스터 태그를 Zotero에 동기화하는 중입니다.');
      const result = await syncClusterTags('cluster:', clusterLabels);
      showToast('동기화 완료', `성공: ${result.success || 0}, 실패: ${result.failed || 0}, 건너뜀: ${result.skipped || 0}`);
    } catch (e) {
      alert('동기화 실패: ' + e.message);
    }
  });

  // Full Sync Modal
  const syncModal = document.getElementById('syncModal');
  const syncSteps = [
    document.getElementById('syncStep1'),
    document.getElementById('syncStep2'),
    document.getElementById('syncStep3'),
    document.getElementById('syncStep4')
  ];
  const syncResult = document.getElementById('syncResult');
  const syncStats = document.getElementById('syncStats');
  const syncError = document.getElementById('syncError');
  const syncErrorMsg = document.getElementById('syncErrorMsg');

  function resetSyncModal() {
    syncSteps.forEach(step => {
      step.className = 'sync-step';
      step.querySelector('.sync-icon').innerHTML = '<i data-lucide="loader" class="spin"></i>';
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
    syncResult.style.display = 'none';
    syncError.style.display = 'none';
  }

  function updateSyncStep(stepIndex, state) {
    const step = syncSteps[stepIndex];
    if (!step) return;
    step.className = 'sync-step ' + state;
    const icon = step.querySelector('.sync-icon');
    if (state === 'active') icon.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i>';
    else if (state === 'done') icon.innerHTML = '<i data-lucide="check"></i>';
    else if (state === 'error') icon.innerHTML = '<i data-lucide="x"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  document.getElementById('fullSync')?.addEventListener('click', async () => {
    resetSyncModal();
    syncModal.classList.add('active');
    updateSyncStep(0, 'active');

    try {
      const result = await apiCall('/full-sync', { method: 'POST' });
      if (result.status === 'already_running') updateSyncStep(0, 'active');

      let lastBuildStatus = null;
      const pollInterval = setInterval(async () => {
        try {
          const status = await apiCall('/sync-status', { method: 'GET' });

          if (!status.running) {
            clearInterval(pollInterval);
            if (status.error) {
              syncSteps.forEach((_, i) => updateSyncStep(i, 'error'));
              syncErrorMsg.textContent = status.error;
              syncError.style.display = 'block';
            } else if (status.last_result) {
              syncSteps.forEach((_, i) => updateSyncStep(i, 'done'));
              const r = status.last_result;
              syncStats.innerHTML = `
                <strong>Build:</strong> ${r.build?.papers || 0} papers, ${r.build?.clusters || 0} clusters<br>
                <strong>Cluster Tags:</strong> ${r.cluster_sync?.success || 0} synced<br>
                <strong>Review Tags:</strong> ${r.review_sync?.success || 0} synced
              `;
              syncResult.style.display = 'block';
            }
          } else if (status.last_result?.build?.status === 'success' && lastBuildStatus !== 'success') {
            updateSyncStep(0, 'done');
            updateSyncStep(1, 'done');
            updateSyncStep(2, 'active');
            lastBuildStatus = 'success';
          }
        } catch (e) { /* Ignore polling errors */ }
      }, 3000);
    } catch (e) {
      updateSyncStep(0, 'error');
      syncErrorMsg.textContent = e.message;
      syncError.style.display = 'block';
    }
  });

  document.getElementById('closeSyncModal').addEventListener('click', () => syncModal.classList.remove('active'));
  document.getElementById('reloadAfterSync').addEventListener('click', () => location.reload());
}

// ============================================================
// Batch Tag Handlers
// ============================================================
function initBatchTagHandlers() {
  const batchTagModal = document.getElementById('batchTagModal');
  const batchCount = document.getElementById('batchCount');
  const batchTagInput = document.getElementById('batchTagInput');
  const batchAction = document.getElementById('batchAction');
  const batchProgress = document.getElementById('batchProgress');
  const batchProgressFill = document.getElementById('batchProgressFill');
  const batchProgressStatus = document.getElementById('batchProgressStatus');

  document.getElementById('batchTagManager')?.addEventListener('click', () => {
    batchCount.textContent = currentFiltered.length;
    batchTagInput.value = '';
    batchProgress.style.display = 'none';
    batchTagModal.classList.add('active');
    batchTagInput.focus();
  });

  document.getElementById('closeBatchTag').addEventListener('click', () => batchTagModal.classList.remove('active'));
  batchTagModal.addEventListener('click', (e) => {
    if (e.target === batchTagModal) batchTagModal.classList.remove('active');
  });

  document.getElementById('executeBatchTag').addEventListener('click', async () => {
    const tag = batchTagInput.value.trim();
    const action = batchAction.value;

    if (!tag) { alert('태그를 입력하세요.'); return; }

    const papers = currentFiltered;
    if (papers.length === 0) { alert('필터된 논문이 없습니다.'); return; }

    const zoteroKeys = papers.map(p => p.id).filter(Boolean);
    if (zoteroKeys.length === 0) { alert('Zotero key가 있는 논문이 없습니다.'); return; }

    const actionText = action === 'add' ? '추가' : '제거';
    if (!confirm(`${zoteroKeys.length}개 논문에 태그 "${tag}"를 ${actionText}합니다.\n계속하시겠습니까?`)) return;

    batchProgress.style.display = 'block';
    batchProgressFill.style.width = '0%';
    batchProgressStatus.textContent = '처리 중...';

    try {
      const result = await batchTagOperationWithProgress(action, tag, zoteroKeys, (done, total) => {
        const pct = Math.round((done / total) * 100);
        batchProgressFill.style.width = pct + '%';
        batchProgressStatus.textContent = `${done} / ${total} 처리 중...`;
      });

      batchProgressStatus.textContent = `완료! 성공: ${result.success}, 실패: ${result.failed}`;

      if (action === 'add') {
        papers.forEach(p => {
          const currentTags = p.tags ? p.tags.split(', ').filter(t => t && t !== 'nan') : [];
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            p.tags = currentTags.join(', ');
          }
        });
        allTags.add(tag);
        refreshTagFilter();
      }

      showToast('일괄 처리 완료', `${result.success}개 성공, ${result.failed}개 실패`);
      setTimeout(() => batchTagModal.classList.remove('active'), 1500);
    } catch (e) {
      batchProgressStatus.textContent = '오류: ' + e.message;
      alert('일괄 처리 실패: ' + e.message);
    }
  });
}

// Show author statistics for filtered papers
function showAuthorStats() {
  const papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
  const authorCounts = {};

  // Count authors - split by semicolon only (authors are "Lastname, Firstname; ...")
  papers.forEach(paper => {
    if (!paper.authors) return;
    const authorList = paper.authors.split(/;/).map(a => a.trim()).filter(a => a);
    authorList.forEach(author => {
      // Normalize author name (remove extra spaces)
      const normalized = author.replace(/\s+/g, ' ').trim();
      if (normalized) {
        authorCounts[normalized] = (authorCounts[normalized] || 0) + 1;
      }
    });
  });

  // Sort by count
  const sorted = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

  // Update count
  document.getElementById('authorStatsCount').textContent = papers.length;

  // Render list
  const listEl = document.getElementById('authorStatsList');
  if (sorted.length === 0) {
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No author data available</div>';
  } else {
    listEl.innerHTML = sorted.map(([author, count], index) => `
      <div class="author-stat-item">
        <span class="author-stat-rank">${index + 1}</span>
        <span class="author-stat-name">${escapeHtml(author)}</span>
        <div class="author-stat-bar">
          <div class="author-stat-bar-fill" style="width: ${(count / maxCount) * 100}%"></div>
        </div>
        <span class="author-stat-count">${count}</span>
      </div>
    `).join('');
  }

  document.getElementById('authorStatsModal').classList.add('active');
}
