/* ===========================================
   List View Module
   =========================================== */

let listSortBy = 'similarity';

// Render list view
function renderListView(papers) {
  const container = document.getElementById('listContainer');
  const countEl = document.getElementById('listCount');
  const sortSelect = document.getElementById('listSortBy');

  if (!container) return;

  // Update count
  if (countEl) {
    countEl.textContent = `${papers.length} papers`;
  }

  // Sort papers
  const sorted = sortPapersForList(papers, listSortBy);

  // Check if semantic search is active
  const hasSimScores = semanticSearchMode && semanticSearchResults;

  // Update sort select visibility
  if (sortSelect) {
    const simOption = sortSelect.querySelector('option[value="similarity"]');
    if (simOption) {
      simOption.disabled = !hasSimScores;
      if (!hasSimScores && listSortBy === 'similarity') {
        listSortBy = 'year-desc';
        sortSelect.value = listSortBy;
      }
    }
  }

  // Build internal citation maps
  const internalRefs = {};  // paper.id -> count of papers it references (in library)
  const internalCited = {}; // paper.id -> count of papers that cite it (in library)
  if (citationLinks) {
    for (const link of citationLinks) {
      internalRefs[link.source] = (internalRefs[link.source] || 0) + 1;
      internalCited[link.target] = (internalCited[link.target] || 0) + 1;
    }
  }

  // Render list items
  let html = '';
  for (const paper of sorted) {
    const clusterLabel = clusterLabels[paper.cluster] || `Cluster ${paper.cluster}`;
    const clusterColor = CLUSTER_COLORS[paper.cluster % CLUSTER_COLORS.length];
    const isSelected = selectedPaper?.id === paper.id;
    const isBookmarked = bookmarkedPapers.has(paper.zotero_key);

    // Get similarity score if available
    let simScore = '';
    if (hasSimScores && semanticSearchResults) {
      const result = semanticSearchResults.find(r => r.id === paper.id);
      if (result) {
        simScore = `<span class="list-item-sim">${(result.similarity * 100).toFixed(1)}%</span>`;
      }
    }

    // Internal citation stats
    const intRefs = internalRefs[paper.id] || 0;
    const intCited = internalCited[paper.id] || 0;

    html += `
      <div class="list-item ${isSelected ? 'selected' : ''}" data-paper-id="${paper.id}">
        <div class="list-item-main">
          <div class="list-item-header">
            ${simScore}
            <span class="list-item-year">${paper.year || '?'}</span>
            <span class="list-item-cluster" style="background: ${clusterColor}; color: black;">${clusterLabel}</span>
            ${isBookmarked ? '<span class="list-item-bookmark"><i data-lucide="star"></i></span>' : ''}
          </div>
          <div class="list-item-title">${escapeHtml(paper.title)}</div>
          <div class="list-item-authors">${escapeHtml(paper.authors || '')}</div>
          <div class="list-item-venue">${escapeHtml(paper.venue || '')}</div>
        </div>
        <div class="list-item-meta">
          ${paper.citation_count ? `<span class="list-item-stat" title="Total citations (Semantic Scholar)"><i data-lucide="quote"></i> ${paper.citation_count}</span>` : ''}
          ${intCited ? `<span class="list-item-stat internal-cited" title="Cited by ${intCited} papers in library"><i data-lucide="arrow-left"></i> ${intCited}</span>` : ''}
          ${intRefs ? `<span class="list-item-stat internal-refs" title="References ${intRefs} papers in library"><i data-lucide="arrow-right"></i> ${intRefs}</span>` : ''}
        </div>
      </div>
    `;
  }

  if (html === '') {
    html = '<div class="list-empty">No papers to display</div>';
  }

  container.innerHTML = html;

  // Render Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Add click handlers
  container.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', () => {
      const paperId = parseInt(item.dataset.paperId);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) {
        showDetail(paper);
        // Update selection state
        container.querySelectorAll('.list-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      }
    });
  });
}

// Sort papers
function sortPapersForList(papers, sortBy) {
  const sorted = [...papers];

  switch (sortBy) {
    case 'similarity':
      if (semanticSearchMode && semanticSearchResults) {
        // Create a map of paper id to similarity
        const simMap = new Map();
        semanticSearchResults.forEach(r => simMap.set(r.id, r.similarity));
        sorted.sort((a, b) => (simMap.get(b.id) || 0) - (simMap.get(a.id) || 0));
      } else {
        // Default to year desc if no similarity scores
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
      }
      break;

    case 'year-desc':
      sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
      break;

    case 'year-asc':
      sorted.sort((a, b) => (a.year || 0) - (b.year || 0));
      break;

    case 'title':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;

    case 'cluster':
      sorted.sort((a, b) => {
        const labelA = clusterLabels[a.cluster] || `Cluster ${a.cluster}`;
        const labelB = clusterLabels[b.cluster] || `Cluster ${b.cluster}`;
        return labelA.localeCompare(labelB);
      });
      break;

    case 'citations':
      sorted.sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
      break;
  }

  return sorted;
}

// Initialize list view handlers
function initListView() {
  const sortSelect = document.getElementById('listSortBy');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      listSortBy = sortSelect.value;
      renderListView(currentFiltered);
    });
  }
}

// Helper
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initListView);
