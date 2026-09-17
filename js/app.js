/* ===========================================
   Main Application - Initialization
   =========================================== */

let appInitialized = false;

// Initialize application (called after auth)
function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  // Initialize Lucide icons for header elements
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Restore panel width before render to avoid layout shift
  const savedWidth = localStorage.getItem('detailPanelWidth');
  if (savedWidth) {
    document.getElementById('detailPanel').style.width = savedWidth;
  }

  // Initialize UI handlers
  initUIHandlers();

  // Initialize sync panel
  initSyncPanel();

  // Initialize ideas section (collapsed by default, expand on Ideas view)
  const ideasSection = document.getElementById('ideasSection');
  if (ideasSection) {
    ideasSection.classList.add('collapsed');
  }
  if (typeof initIdeasPanel === 'function') {
    initIdeasPanel();
    if (ideasSection) ideasSection.dataset.initialized = 'true';
  }

  // Initialize mobile handlers
  initMobileHandlers();

  // Load data and initialize timeline
  loadData().then(() => {
    // Initialize mini timeline after data is loaded
    if (typeof renderMiniTimeline === 'function') {
      renderMiniTimeline(allPapers);
    }
    if (typeof initMiniTimelineBrush === 'function') {
      initMiniTimelineBrush();
    }

    // Restore saved view (default to 'map', mobile will auto-switch to list)
    const savedView = localStorage.getItem('currentView');
    const viewToUse = (savedView && ['map', 'list', 'timeline'].includes(savedView)) ? savedView : 'map';
    switchView(viewToUse);

    // Check URL for paper parameter (zotero_key) and open if present
    const paperKeyFromUrl = getPaperKeyFromUrl();
    if (paperKeyFromUrl) {
      const paper = allPapers.find(p => p.zotero_key === paperKeyFromUrl);
      if (paper) {
        selectedPaper = paper;
        showDetail(paper);
        render(currentFiltered);
      }
    }
  }).catch(err => {
    // loadData() already surfaced this in the loading overlay; nothing below it
    // can run without data, so just record it.
    console.error('Initialization aborted: papers.json failed to load', err);
  });
}
