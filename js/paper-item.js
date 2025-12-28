/* ===========================================
   Paper Item Rendering (Shared)
   =========================================== */

// Default cluster colors (can be overridden)
const DEFAULT_CLUSTER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Abbreviate author names (e.g., "Kim, Lee, Park" -> "Kim et al.")
 */
function abbreviateAuthors(authors, maxAuthors = 1) {
  if (!authors) return '';
  const authorList = authors.split(/[;,]/).map(a => a.trim()).filter(Boolean);
  if (authorList.length === 0) return '';
  if (authorList.length <= maxAuthors) return authorList.join(', ');
  return authorList.slice(0, maxAuthors).join(', ') + ' et al.';
}

/**
 * Render a paper item HTML
 * @param {Object} paper - Paper object
 * @param {Object} options - Rendering options
 * @param {boolean} options.showActions - Show bookmark/idea buttons (default: false)
 * @param {number|null} options.similarity - Similarity score (0-1) or null
 * @param {number} options.intCited - Internal cited by count
 * @param {number} options.intRefs - Internal references count
 * @param {Array} options.clusterColors - Cluster color array
 * @param {Object} options.clusterLabels - Cluster label map
 * @param {boolean} options.isSelected - Is this paper selected
 * @param {boolean} options.isBookmarked - Is this paper bookmarked
 * @param {Array} options.connectedIdeas - Array of connected idea titles
 * @param {boolean} options.compact - Compact mode for smaller displays
 */
function renderPaperItemHtml(paper, options = {}) {
  const {
    showActions = false,
    similarity = null,
    intCited = 0,
    intRefs = 0,
    clusterColors = DEFAULT_CLUSTER_COLORS,
    clusterLabels = {},
    isSelected = false,
    isBookmarked = false,
    connectedIdeas = [],
    compact = false
  } = options;

  const clusterLabel = clusterLabels[paper.cluster] || `C${paper.cluster}`;
  const clusterColor = clusterColors[paper.cluster % clusterColors.length];

  // Similarity score
  const simScore = similarity !== null
    ? `<span class="list-item-sim">${(similarity * 100).toFixed(0)}%</span>`
    : '';

  // Actions (bookmark, idea buttons)
  const actionsHtml = showActions ? `
    <div class="list-item-actions">
      <button class="list-bookmark-btn ${isBookmarked ? 'active' : ''}" title="Toggle bookmark" data-paper-id="${paper.id}">
        <i data-lucide="star" ${isBookmarked ? 'class="filled"' : ''}></i>
      </button>
      <div class="list-idea-dropdown">
        <button class="list-idea-btn ${connectedIdeas.length > 0 ? 'has-ideas' : ''}" title="${connectedIdeas.length > 0 ? 'Connected: ' + connectedIdeas.join(', ') : 'Link to idea'}">
          <i data-lucide="lightbulb"></i>
          ${connectedIdeas.length > 0 ? `<span class="idea-count">${connectedIdeas.length}</span>` : ''}
        </button>
        <div class="dropdown-menu list-idea-menu"></div>
      </div>
    </div>
  ` : '';

  // Citation stats
  const statsHtml = (paper.citation_count || intCited || intRefs) ? `
    <div class="list-item-meta">
      ${paper.citation_count ? `<span class="list-item-stat" title="Total citations"><i data-lucide="quote"></i> ${paper.citation_count}</span>` : ''}
      ${intCited ? `<span class="list-item-stat internal-cited" title="Cited by ${intCited} in library"><i data-lucide="arrow-left"></i> ${intCited}</span>` : ''}
      ${intRefs ? `<span class="list-item-stat internal-refs" title="References ${intRefs} in library"><i data-lucide="arrow-right"></i> ${intRefs}</span>` : ''}
    </div>
  ` : '';

  return `
    <div class="list-item ${isSelected ? 'selected' : ''} ${compact ? 'compact' : ''}" data-paper-id="${paper.id}" data-zotero-key="${paper.zotero_key || ''}">
      ${actionsHtml}
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(paper.title)}</div>
        <div class="list-item-meta-line">
          ${simScore}
          <span class="list-item-year">${paper.year || '?'}</span>
          <span class="list-item-cluster" style="background: ${clusterColor};">${escapeHtml(clusterLabel)}</span>
          <span class="list-item-authors" title="${escapeHtml(paper.authors || '')}">${escapeHtml(abbreviateAuthors(paper.authors))}</span>
          <span class="list-item-venue" title="${escapeHtml(paper.venue_full || paper.venue || '')}">${escapeHtml(paper.venue || '')}</span>
        </div>
      </div>
      ${statsHtml}
    </div>
  `;
}
