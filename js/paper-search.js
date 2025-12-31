/* ===========================================
   Paper Search Component (Shared)
   Reusable paper search with optional semantic search
   =========================================== */

/**
 * Create a paper search instance
 * @param {Object} config - Configuration
 * @param {HTMLElement} config.inputEl - Search input element
 * @param {HTMLElement} config.resultsEl - Results container element
 * @param {HTMLElement} config.toggleEl - Optional semantic toggle button element
 * @param {Function} config.getPapers - Function that returns papers array
 * @param {Function} config.onSelect - Callback when paper is selected (paper) => void
 * @param {Function} config.onDetail - Optional callback for showing detail (paper) => void
 * @param {Object} config.options - Additional options
 * @param {boolean} config.options.showAddButton - Show add button on results
 * @param {Function} config.options.onAdd - Callback for add button (paper) => void
 * @param {Function} config.options.semanticSearchFn - Semantic search function (query) => Promise<Map<id, score>>
 * @param {number} config.options.minChars - Minimum characters to trigger search (default: 2)
 * @param {number} config.options.maxResults - Maximum results to show (default: 10)
 */
function createPaperSearch(config) {
  const {
    inputEl,
    resultsEl,
    toggleEl = null,
    getPapers,
    onSelect,
    onDetail,
    options = {}
  } = config;

  const {
    showAddButton = false,
    onAdd = null,
    semanticSearchFn = null,
    minChars = 2,
    maxResults = 10
  } = options;

  let lastQuery = '';
  let semanticResults = null;
  let isSemanticMode = false;

  // Search on Enter key
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch(inputEl.value.trim());
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  });

  // Bind toggle button if provided
  if (toggleEl && semanticSearchFn) {
    toggleEl.addEventListener('click', () => {
      isSemanticMode = !isSemanticMode;
      toggleEl.classList.toggle('active', isSemanticMode);
      // Re-search with current query
      if (lastQuery) {
        performSearch(lastQuery);
      }
    });
  }

  function showLoading() {
    resultsEl.innerHTML = `
      <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <span>Searching...</span>
      </div>
    `;
    resultsEl.classList.add('has-results');
  }

  async function performSearch(query) {
    lastQuery = query;

    if (!query || query.length < minChars) {
      hideResults();
      return;
    }

    const papers = getPapers();
    if (!papers || papers.length === 0) {
      hideResults();
      return;
    }

    // Show loading
    showLoading();

    let results = [];

    // Use semantic search if mode is active
    if (isSemanticMode && semanticSearchFn && query.length >= 2) {
      try {
        if (toggleEl) toggleEl.classList.add('loading');

        semanticResults = await semanticSearchFn(query);

        if (toggleEl) toggleEl.classList.remove('loading');

        if (semanticResults && semanticResults.size > 0) {
          // Sort by similarity
          results = papers
            .filter(p => semanticResults.has(p.id))
            .map(p => ({ ...p, similarity: semanticResults.get(p.id) }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
        }
      } catch (err) {
        console.warn('Semantic search failed:', err);
        if (toggleEl) toggleEl.classList.remove('loading');
        semanticResults = null;
      }
    }

    // Use text search if not semantic mode or no results
    if (!isSemanticMode || results.length === 0) {
      const lowerQuery = query.toLowerCase();
      results = papers.filter(p =>
        p.title?.toLowerCase().includes(lowerQuery) ||
        p.authors?.toLowerCase().includes(lowerQuery) ||
        p.year?.toString().includes(lowerQuery)
      ).slice(0, maxResults);
    }

    renderResults(results);
  }

  function renderResults(results) {
    if (!results || results.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">No papers found</div>';
      showResults();
      return;
    }

    // Get cluster labels if available
    const papers = getPapers();
    const clusterLabels = {};
    papers.forEach(p => {
      if (p.cluster_label) clusterLabels[p.cluster] = p.cluster_label;
    });

    resultsEl.innerHTML = results.map(paper => {
      const similarity = paper.similarity;
      const itemHtml = renderPaperItemHtml(paper, {
        similarity: similarity,
        clusterLabels: clusterLabels,
        compact: true
      });

      if (showAddButton) {
        return `
          <div class="search-result-wrapper" data-paper-id="${paper.id}">
            ${itemHtml}
            <button class="search-result-add" title="Add">
              <i data-lucide="plus"></i>
            </button>
          </div>
        `;
      } else {
        return `
          <div class="search-result-wrapper" data-paper-id="${paper.id}">
            ${itemHtml}
          </div>
        `;
      }
    }).join('');

    // Bind click events
    resultsEl.querySelectorAll('.search-result-wrapper').forEach(el => {
      const paperId = parseInt(el.dataset.paperId);
      const paper = getPapers().find(p => p.id === paperId);
      if (!paper) return;

      // Click on item -> select or show detail
      const listItem = el.querySelector('.list-item');
      if (listItem) {
        listItem.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onDetail) {
            onDetail(paper);
          } else if (onSelect) {
            onSelect(paper);
            clearSearch();
          }
        });
      }

      // Click on add button
      const addBtn = el.querySelector('.search-result-add');
      if (addBtn && onAdd) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onAdd(paper);
        });
      }
    });

    // Re-initialize lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    showResults();
  }

  function showResults() {
    resultsEl.classList.add('has-results');
  }

  function hideResults() {
    resultsEl.classList.remove('has-results');
    resultsEl.innerHTML = '';
  }

  function clearSearch() {
    inputEl.value = '';
    lastQuery = '';
    hideResults();
  }

  // Set semantic mode
  function setSemanticMode(enabled) {
    isSemanticMode = enabled;
    if (toggleEl) {
      toggleEl.classList.toggle('active', isSemanticMode);
    }
  }

  // Public API
  return {
    clear: clearSearch,
    search: performSearch,
    hide: hideResults,
    setSemanticMode,
    isSemanticMode: () => isSemanticMode
  };
}

/**
 * Create a paper detail panel instance
 * @param {Object} config - Configuration
 * @param {HTMLElement} config.panelEl - Panel container element
 * @param {HTMLElement} config.titleEl - Title element
 * @param {HTMLElement} config.metaEl - Meta element
 * @param {HTMLElement} config.linksEl - Links element
 * @param {HTMLElement} config.abstractEl - Abstract element
 * @param {HTMLElement} config.notesEl - Notes element
 * @param {Function} config.getPapers - Function that returns papers array
 * @param {Object} config.getMeta - Function that returns dataMeta object
 */
function createPaperDetailPanel(config) {
  const {
    panelEl,
    titleEl,
    metaEl,
    linksEl,
    abstractEl,
    notesEl,
    getPapers,
    getMeta = () => ({})
  } = config;

  let selectedPaper = null;

  function show(paperId) {
    const papers = getPapers();
    const paper = typeof paperId === 'object' ? paperId : papers.find(p => p.id === paperId);
    if (!paper) return;

    selectedPaper = paper;
    const meta = getMeta();

    // Title
    if (titleEl) {
      titleEl.textContent = paper.title || 'Untitled';
    }

    // Meta
    if (metaEl) {
      const metaParts = [];
      if (paper.authors) metaParts.push(abbreviateAuthors(paper.authors, 2));
      if (paper.year) metaParts.push(paper.year);
      if (paper.publication || paper.venue) metaParts.push(paper.publication || paper.venue);
      metaEl.textContent = metaParts.join(' · ');
    }

    // Links
    if (linksEl) {
      linksEl.innerHTML = renderPaperLinksHtml(paper, meta);
    }

    // Abstract
    if (abstractEl) {
      abstractEl.textContent = paper.abstract || '';
    }

    // Notes
    if (notesEl) {
      if (paper.notes || paper.notes_html) {
        const noteContent = paper.notes_html || escapeHtml(paper.notes) || '';
        notesEl.innerHTML = `
          <div class="notes-section">
            <h3>Notes</h3>
            <div class="notes-content">${noteContent}</div>
          </div>
        `;
      } else {
        notesEl.innerHTML = '';
      }
    }

    // Re-initialize lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  function open() {
    panelEl.classList.add('open');
  }

  function close() {
    panelEl.classList.remove('open');
  }

  function toggle() {
    panelEl.classList.toggle('open');
    return panelEl.classList.contains('open');
  }

  function getSelectedPaper() {
    return selectedPaper;
  }

  // Public API
  return {
    show,
    open,
    close,
    toggle,
    getSelectedPaper
  };
}
