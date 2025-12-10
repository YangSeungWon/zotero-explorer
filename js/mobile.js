/* ===========================================
   Mobile UI Functions
   =========================================== */

const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

// Hamburger Menu
function openMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  mobileMenu.classList.add('active');
  mobileMenuOverlay.classList.add('active');
  hamburgerBtn.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  mobileMenu.classList.remove('active');
  mobileMenuOverlay.classList.remove('active');
  hamburgerBtn.classList.remove('active');
  document.body.style.overflow = '';
}

// Bottom Sheet
function openBottomSheet() {
  document.getElementById('bottomSheet').classList.add('active');
}

function closeBottomSheet() {
  document.getElementById('bottomSheet').classList.remove('active');
  if (isMobile()) {
    selectedPaper = null;
    connectedPapers = new Set();
    updateUrlWithPaper(null);  // Clear paper from URL
    render(currentFiltered);
  }
}

// Mobile Cluster Chips
function populateMobileClusterChips() {
  const container = document.getElementById('mobileClusterChips');
  if (!container) return;

  container.innerHTML = '';

  // All chip
  const allChip = document.createElement('div');
  allChip.className = 'cluster-chip' + (highlightCluster === null ? ' active' : '');
  allChip.textContent = 'All';
  allChip.addEventListener('click', () => {
    highlightCluster = null;
    updateMobileClusterChips();
    applyFilters();
  });
  container.appendChild(allChip);

  // Cluster chips
  const clusters = [...new Set(allPapers.map(p => p.cluster))].sort((a, b) => a - b);
  clusters.forEach(c => {
    const label = clusterLabels[c] || `C${c}`;
    const chip = document.createElement('div');
    chip.className = 'cluster-chip' + (highlightCluster === c ? ' active' : '');
    chip.dataset.cluster = c;
    const shortLabel = label.length > 12 ? label.substring(0, 12) + '..' : label;
    chip.innerHTML = `<span class="chip-dot" style="background: ${CLUSTER_COLORS[c % CLUSTER_COLORS.length]}"></span>${shortLabel}`;
    chip.addEventListener('click', () => {
      if (highlightCluster === c) {
        highlightCluster = null;
      } else {
        highlightCluster = c;
      }
      updateMobileClusterChips();
      applyFilters();
    });
    container.appendChild(chip);
  });
}

function updateMobileClusterChips() {
  const chips = document.querySelectorAll('.cluster-chip');
  chips.forEach(chip => {
    if (chip.dataset.cluster) {
      chip.classList.toggle('active', highlightCluster === parseInt(chip.dataset.cluster));
    } else {
      chip.classList.toggle('active', highlightCluster === null);
    }
  });
}

// Sync controls
function syncMobileControls() {
  document.getElementById('mobileMinYear').value = document.getElementById('minYear').value;
  document.getElementById('mobileMinVenue').value = document.getElementById('minVenue').value;
  document.getElementById('mobilePapersOnly').checked = document.getElementById('papersOnly').checked;
  document.getElementById('mobileTagFilter').value = document.getElementById('tagFilter').value;
  document.getElementById('mobileSearchFilter').value = document.getElementById('searchFilter').value;
  document.getElementById('mobileShowCitations').checked = document.getElementById('showCitations').checked;
}

function syncDesktopControls() {
  document.getElementById('minYear').value = document.getElementById('mobileMinYear').value;
  document.getElementById('minVenue').value = document.getElementById('mobileMinVenue').value;
  document.getElementById('papersOnly').checked = document.getElementById('mobilePapersOnly').checked;
  document.getElementById('tagFilter').value = document.getElementById('mobileTagFilter').value;
  document.getElementById('searchFilter').value = document.getElementById('mobileSearchFilter').value;
  document.getElementById('showCitations').checked = document.getElementById('mobileShowCitations').checked;
  showCitations = document.getElementById('mobileShowCitations').checked;
}

// Initialize mobile event handlers
function initMobileHandlers() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const bottomSheet = document.getElementById('bottomSheet');
  const bottomSheetHandle = document.getElementById('bottomSheetHandle');
  const bottomSheetClose = document.getElementById('bottomSheetClose');

  hamburgerBtn.addEventListener('click', () => {
    if (mobileMenu.classList.contains('active')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  mobileMenuOverlay.addEventListener('click', closeMobileMenu);

  // Swipe to close menu
  let menuTouchStartX = 0;
  mobileMenu.addEventListener('touchstart', (e) => {
    menuTouchStartX = e.touches[0].clientX;
  }, { passive: true });

  mobileMenu.addEventListener('touchmove', (e) => {
    const deltaX = e.touches[0].clientX - menuTouchStartX;
    if (deltaX < -50) {
      closeMobileMenu();
    }
  }, { passive: true });

  // Bottom sheet
  bottomSheetClose.addEventListener('click', closeBottomSheet);

  let sheetTouchStartY = 0;
  let sheetTouchCurrentY = 0;
  let isDraggingSheet = false;

  bottomSheetHandle.addEventListener('touchstart', (e) => {
    isDraggingSheet = true;
    sheetTouchStartY = e.touches[0].clientY;
    bottomSheet.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDraggingSheet) return;
    sheetTouchCurrentY = e.touches[0].clientY;
    const deltaY = sheetTouchCurrentY - sheetTouchStartY;
    if (deltaY > 0) {
      bottomSheet.style.transform = `translateY(${deltaY}px)`;
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isDraggingSheet) return;
    isDraggingSheet = false;
    const deltaY = sheetTouchCurrentY - sheetTouchStartY;
    bottomSheet.style.transition = 'transform 0.3s ease';
    bottomSheet.style.transform = '';
    if (deltaY > 100) {
      closeBottomSheet();
    } else {
      openBottomSheet();
    }
  });

  // Mobile control handlers
  document.getElementById('mobileMinYear').addEventListener('change', () => {
    syncDesktopControls();
    applyFilters();
  });
  document.getElementById('mobileMinVenue').addEventListener('change', () => {
    syncDesktopControls();
    applyFilters();
  });
  document.getElementById('mobilePapersOnly').addEventListener('change', () => {
    syncDesktopControls();
    applyFilters();
  });
  document.getElementById('mobileTagFilter').addEventListener('change', () => {
    syncDesktopControls();
    applyFilters();
  });
  document.getElementById('mobileSearchFilter').addEventListener('input', debounce(() => {
    syncDesktopControls();
    applyFilters();
  }, 200));
  document.getElementById('mobileShowCitations').addEventListener('change', () => {
    syncDesktopControls();
    render(currentFiltered);
  });
  document.getElementById('mobileResetFilter').addEventListener('click', () => {
    document.getElementById('resetFilter').click();
    syncMobileControls();
    closeMobileMenu();
  });
  document.getElementById('mobileShowStats').addEventListener('click', () => {
    document.getElementById('showGlobalStats').click();
    closeMobileMenu();
  });
  document.getElementById('mobileCopyExport').addEventListener('click', () => {
    document.getElementById('copyFiltered').click();
    closeMobileMenu();
  });
  document.getElementById('mobileFullSync').addEventListener('click', () => {
    document.getElementById('fullSync').click();
    closeMobileMenu();
  });
  document.getElementById('mobileBatchTags').addEventListener('click', () => {
    document.getElementById('batchTagManager').click();
    closeMobileMenu();
  });
  document.getElementById('mobileThemeToggle').addEventListener('click', () => {
    document.getElementById('themeToggle').click();
    document.getElementById('mobileThemeToggle').textContent =
      document.getElementById('themeToggle').textContent;
  });

  // Window resize
  window.addEventListener('resize', debounce(() => {
    if (!isMobile()) {
      closeMobileMenu();
      closeBottomSheet();
    }
    Plotly.Plots.resize('plot');
  }, 250));
}
