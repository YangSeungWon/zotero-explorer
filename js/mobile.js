/* ===========================================
   Mobile UI Functions (Simplified - List only)
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
    updateUrlWithPaper(null);
    renderListView(currentFiltered);
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
    chip.innerHTML = `<span class="chip-dot" style="background: ${clusterColor(c)}"></span>${shortLabel}`;
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
  // Update mobile chips
  const chips = document.querySelectorAll('.cluster-chip');
  chips.forEach(chip => {
    if (chip.dataset.cluster) {
      chip.classList.toggle('active', highlightCluster === parseInt(chip.dataset.cluster));
    } else {
      chip.classList.toggle('active', highlightCluster === null);
    }
  });
  // Sync desktop cluster panel
  document.querySelectorAll('.cluster-item').forEach(el => {
    const c = parseInt(el.dataset.cluster);
    el.classList.toggle('active', highlightCluster === c);
  });
}

// Sync controls (simplified)
function syncMobileControls() {
  const tagFilter = document.getElementById('mobileTagFilter');
  const bookmarkedOnly = document.getElementById('mobileBookmarkedOnly');
  const sortBy = document.getElementById('mobileSortBy');
  const headerSearch = document.getElementById('mobileHeaderSearch');

  if (tagFilter) tagFilter.value = document.getElementById('tagFilter')?.value || '';
  if (bookmarkedOnly) bookmarkedOnly.checked = document.getElementById('bookmarkedOnly')?.checked || false;
  if (sortBy) sortBy.value = document.getElementById('listSortBy')?.value || 'year-desc';
  if (headerSearch) headerSearch.value = document.getElementById('searchFilter')?.value || '';
}

function syncDesktopControls() {
  const mobileTagFilter = document.getElementById('mobileTagFilter');
  const mobileBookmarkedOnly = document.getElementById('mobileBookmarkedOnly');
  const mobileSortBy = document.getElementById('mobileSortBy');
  const mobileHeaderSearch = document.getElementById('mobileHeaderSearch');

  if (mobileTagFilter) {
    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) tagFilter.value = mobileTagFilter.value;
  }
  if (mobileBookmarkedOnly) {
    const bookmarkedOnly = document.getElementById('bookmarkedOnly');
    if (bookmarkedOnly) bookmarkedOnly.checked = mobileBookmarkedOnly.checked;
  }
  if (mobileSortBy) {
    const listSortBy = document.getElementById('listSortBy');
    if (listSortBy) listSortBy.value = mobileSortBy.value;
  }
  if (mobileHeaderSearch) {
    const searchFilter = document.getElementById('searchFilter');
    if (searchFilter) searchFilter.value = mobileHeaderSearch.value;
  }
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

  // Mobile header search
  const mobileHeaderSearch = document.getElementById('mobileHeaderSearch');
  const mobileSearchBtn = document.getElementById('mobileSearchBtn');
  const mobileAISearchBtn = document.getElementById('mobileAISearchBtn');

  // 텍스트 검색 실행
  function executeTextSearch() {
    // 시맨틱 검색 모드 끄기
    const desktopToggle = document.getElementById('semanticToggle');
    if (desktopToggle && desktopToggle.classList.contains('active')) {
      desktopToggle.click();
    }
    syncDesktopControls();
    applyFilters();
  }

  // AI 시맨틱 검색 실행
  function executeAISearch() {
    if (!mobileHeaderSearch.value.trim()) return;

    // 시맨틱 검색 모드 켜기
    const desktopToggle = document.getElementById('semanticToggle');
    if (desktopToggle && !desktopToggle.classList.contains('active')) {
      desktopToggle.click();
    }
    document.getElementById('searchFilter').value = mobileHeaderSearch.value;
    syncDesktopControls();
    applyFilters();
  }

  if (mobileHeaderSearch) {
    // Enter 키 = 텍스트 검색
    mobileHeaderSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeTextSearch();
        mobileHeaderSearch.blur();
      }
    });
  }

  // 텍스트 검색 버튼
  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => {
      executeTextSearch();
      mobileHeaderSearch?.blur();
    });
  }

  // AI 검색 버튼
  if (mobileAISearchBtn) {
    mobileAISearchBtn.addEventListener('click', () => {
      executeAISearch();
      mobileHeaderSearch?.blur();
    });
  }

  // Mobile menu control handlers
  const mobileTagFilter = document.getElementById('mobileTagFilter');
  if (mobileTagFilter) {
    mobileTagFilter.addEventListener('change', () => {
      syncDesktopControls();
      applyFilters();
    });
  }

  const mobileBookmarkedOnly = document.getElementById('mobileBookmarkedOnly');
  if (mobileBookmarkedOnly) {
    mobileBookmarkedOnly.addEventListener('change', () => {
      syncDesktopControls();
      applyFilters();
    });
  }

  const mobileSortBy = document.getElementById('mobileSortBy');
  if (mobileSortBy) {
    mobileSortBy.addEventListener('change', () => {
      syncDesktopControls();
      renderListView(currentFiltered);
    });
  }

  const mobileResetFilter = document.getElementById('mobileResetFilter');
  if (mobileResetFilter) {
    mobileResetFilter.addEventListener('click', () => {
      document.getElementById('resetFilter')?.click();
      if (mobileHeaderSearch) mobileHeaderSearch.value = '';
      syncMobileControls();
      closeMobileMenu();
    });
  }

  const mobileThemeToggle = document.getElementById('mobileThemeToggle');
  if (mobileThemeToggle) {
    mobileThemeToggle.addEventListener('click', () => {
      document.getElementById('themeToggle')?.click();
    });
  }

  // Window resize
  window.addEventListener('resize', debounce(() => {
    if (!isMobile()) {
      closeMobileMenu();
      closeBottomSheet();
    }
  }, 250));
}

/* ===========================================
   Mobile Filter Status Bar
   =========================================== */

// 필터 상태 바에 현재 활성 필터들을 표시
function updateMobileFilterStatus() {
  const container = document.getElementById('mobileFilterStatus');
  if (!container) return;

  const chips = [];

  // 검색어
  const searchValue = document.getElementById('searchFilter')?.value?.trim();
  if (searchValue) {
    chips.push({
      type: 'search',
      label: `"${searchValue.length > 15 ? searchValue.slice(0, 15) + '...' : searchValue}"`,
      clear: () => {
        document.getElementById('searchFilter').value = '';
        document.getElementById('mobileHeaderSearch').value = '';
        applyFilters();
      }
    });
  }

  // 클러스터
  if (highlightCluster !== null) {
    const label = clusterLabels[highlightCluster] || `Cluster ${highlightCluster}`;
    chips.push({
      type: 'cluster',
      label: label.length > 12 ? label.slice(0, 12) + '..' : label,
      clear: () => {
        highlightCluster = null;
        updateMobileClusterList();
        document.querySelectorAll('.cluster-item').forEach(el => el.classList.remove('active'));
        applyFilters();
      }
    });
  }

  // 태그
  const tagValue = document.getElementById('tagFilter')?.value;
  if (tagValue) {
    chips.push({
      type: 'tag',
      label: `#${tagValue}`,
      clear: () => {
        document.getElementById('tagFilter').value = '';
        document.getElementById('mobileTagFilter').value = '';
        applyFilters();
      }
    });
  }

  // 북마크
  if (document.getElementById('bookmarkedOnly')?.checked) {
    chips.push({
      type: 'bookmark',
      label: '★ Bookmarked',
      clear: () => {
        document.getElementById('bookmarkedOnly').checked = false;
        document.getElementById('mobileBookmarkedOnly').checked = false;
        applyFilters();
      }
    });
  }

  // 연도 범위
  if (yearRange) {
    chips.push({
      type: 'year',
      label: `${yearRange.min}-${yearRange.max}`,
      clear: () => {
        yearRange = null;
        if (typeof clearMiniTimelineBrush === 'function') {
          clearMiniTimelineBrush();
        }
        applyFilters();
      }
    });
  }

  // 렌더링
  if (chips.length === 0) {
    container.innerHTML = '';
    container.classList.remove('has-filters');
    return;
  }

  container.innerHTML = chips.map((c, i) => `
    <span class="mobile-filter-chip" data-index="${i}">
      ${c.label}
      <span class="remove">×</span>
    </span>
  `).join('');

  // 클로저로 chips 배열 캡처하여 이벤트 바인딩
  const chipsCopy = [...chips];
  container.querySelectorAll('.mobile-filter-chip').forEach((el, i) => {
    el.querySelector('.remove').onclick = (e) => {
      e.stopPropagation();
      chipsCopy[i].clear();
    };
  });

  container.classList.add('has-filters');
}

/* ===========================================
   Mobile Menu Cluster List
   =========================================== */

// 메뉴 내 클러스터 리스트 생성
function populateMobileClusterList() {
  const container = document.getElementById('mobileClusterList');
  if (!container) return;

  const clusters = [...new Set(allPapers.map(p => p.cluster))].sort((a, b) => a - b);

  // 클러스터별 논문 개수 계산
  const clusterCounts = {};
  allPapers.forEach(p => {
    if (p.has_notes) {  // 노트가 있는 논문만 카운트
      clusterCounts[p.cluster] = (clusterCounts[p.cluster] || 0) + 1;
    }
  });

  const totalCount = allPapers.filter(p => p.has_notes).length;

  container.innerHTML = `
    <div class="mobile-cluster-item ${highlightCluster === null ? 'active' : ''}" data-cluster="">
      <span class="mobile-cluster-label">All Clusters</span>
      <span class="mobile-cluster-count">${totalCount}</span>
    </div>
    ${clusters.map(c => {
      const label = clusterLabels[c] || `Cluster ${c}`;
      const color = clusterColor(c);
      return `
        <div class="mobile-cluster-item ${highlightCluster === c ? 'active' : ''}" data-cluster="${c}">
          <span class="mobile-cluster-dot" style="background: ${color}"></span>
          <span class="mobile-cluster-label">${label}</span>
          <span class="mobile-cluster-count">${clusterCounts[c] || 0}</span>
        </div>
      `;
    }).join('')}
  `;

  // 이벤트 바인딩
  container.querySelectorAll('.mobile-cluster-item').forEach(el => {
    el.onclick = () => {
      const c = el.dataset.cluster;
      highlightCluster = c === '' ? null : parseInt(c);
      updateMobileClusterList();
      // 데스크톱 클러스터 패널도 동기화
      document.querySelectorAll('.cluster-item').forEach(item => {
        const itemCluster = parseInt(item.dataset.cluster);
        item.classList.toggle('active', highlightCluster === itemCluster);
      });
      applyFilters();
      closeMobileMenu();  // 선택 후 메뉴 닫기
    };
  });
}

// 클러스터 리스트 active 상태 업데이트
function updateMobileClusterList() {
  const items = document.querySelectorAll('.mobile-cluster-item');
  items.forEach(el => {
    const c = el.dataset.cluster;
    const isActive = (c === '' && highlightCluster === null) ||
                     (c !== '' && highlightCluster === parseInt(c));
    el.classList.toggle('active', isActive);
  });
}
