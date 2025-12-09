/* ===========================================
   Main Application - Initialization
   =========================================== */

// Initialize application
(function() {
  // Restore panel width before render to avoid layout shift
  const savedWidth = localStorage.getItem('detailPanelWidth');
  if (savedWidth) {
    document.getElementById('detailPanel').style.width = savedWidth;
  }

  // Initialize UI handlers
  initUIHandlers();

  // Initialize sync panel
  initSyncPanel();

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
  });
})();
