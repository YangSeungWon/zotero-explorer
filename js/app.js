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

  // Initialize mobile handlers
  initMobileHandlers();

  // Load data
  loadData();
})();
