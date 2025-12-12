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
      const similarity = semanticSearchResults.get(paper.id);
      if (similarity !== undefined) {
        simScore = `<span class="list-item-sim">${(similarity * 100).toFixed(1)}%</span>`;
      }
    }

    // Internal citation stats
    const intRefs = internalRefs[paper.id] || 0;
    const intCited = internalCited[paper.id] || 0;

    // Check which ideas this paper is connected to
    const connectedIdeas = (typeof allIdeas !== 'undefined' ? allIdeas : [])
      .filter(idea => idea.connected_papers?.includes(paper.zotero_key))
      .map(idea => idea.title);

    html += `
      <div class="list-item ${isSelected ? 'selected' : ''}" data-paper-id="${paper.id}" data-zotero-key="${paper.zotero_key}">
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
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(paper.title)}</div>
          <div class="list-item-meta-line">
            ${simScore}
            <span class="list-item-year">${paper.year || '?'}</span>
            <span class="list-item-cluster" style="background: ${clusterColor}; color: black;">${clusterLabel}</span>
            <span class="list-item-authors" title="${escapeHtml(paper.authors || '')}">${escapeHtml(abbreviateAuthors(paper.authors))}</span>
            <span class="list-item-venue" title="${escapeHtml(paper.venue || '')}">${escapeHtml(abbreviateVenue(paper.venue))}</span>
          </div>
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

  // Add click handlers for list items (excluding action buttons)
  container.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't trigger if clicking on action buttons
      if (e.target.closest('.list-item-actions')) return;

      const paperId = parseInt(item.dataset.paperId);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) {
        showDetail(paper);
        // Selection state is handled by renderListView() called from showDetail()
      }
    });
  });

  // Bookmark button handlers
  container.querySelectorAll('.list-bookmark-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const paperId = parseInt(btn.dataset.paperId);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) {
        const nowBookmarked = await toggleBookmark(paper);
        btn.classList.toggle('active', nowBookmarked);
        const icon = btn.querySelector('[data-lucide]');
        if (icon) {
          icon.classList.toggle('filled', nowBookmarked);
        }
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }
    });
  });

  // Idea dropdown handlers
  container.querySelectorAll('.list-idea-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.closest('.list-idea-dropdown');
      const menu = dropdown.querySelector('.list-idea-menu');
      const item = btn.closest('.list-item');
      const zoteroKey = item.dataset.zoteroKey;

      // Close other dropdowns
      container.querySelectorAll('.list-idea-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
      });

      // Build menu
      const ideas = typeof allIdeas !== 'undefined' ? allIdeas : [];
      if (ideas.length === 0) {
        menu.innerHTML = '<div class="idea-menu-empty">No ideas yet</div>';
      } else {
        menu.innerHTML = ideas.map(idea => {
          const isConnected = idea.connected_papers?.includes(zoteroKey);
          return `
            <div class="dropdown-item idea-menu-item ${isConnected ? 'connected' : ''}" data-idea-key="${idea.zotero_key}">
              <i data-lucide="${isConnected ? 'check' : 'plus'}"></i>
              <span>${escapeHtml(idea.title)}</span>
            </div>
          `;
        }).join('');

        // Add click handlers for menu items
        menu.querySelectorAll('.idea-menu-item').forEach(menuItem => {
          menuItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ideaKey = menuItem.dataset.ideaKey;
            const isConnected = menuItem.classList.contains('connected');

            // Show saving indicator
            if (typeof showSavingIndicator === 'function') {
              showSavingIndicator('saving');
            }

            let result;
            if (isConnected) {
              result = await removePaperFromIdea(ideaKey, zoteroKey);
            } else {
              result = await addPaperToIdea(ideaKey, zoteroKey);
            }

            // Show result
            if (typeof showSavingIndicator === 'function') {
              showSavingIndicator(result !== null ? 'saved' : 'failed');
            }

            // Refresh the list and ideas panel
            renderListView(currentFiltered);
            if (typeof renderIdeasPanel === 'function') {
              renderIdeasPanel();
            }
            // Refresh idea detail if this idea is selected
            if (typeof selectedIdea !== 'undefined' && selectedIdea?.zotero_key === ideaKey) {
              if (typeof renderIdeaDetail === 'function') {
                renderIdeaDetail(selectedIdea);
              }
            }
          });
        });
      }

      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      menu.classList.toggle('active');
    });
  });

}

// Sort papers
function sortPapersForList(papers, sortBy) {
  const sorted = [...papers];

  // Build internal citation map for secondary sort
  const internalCited = {};
  if (citationLinks) {
    for (const link of citationLinks) {
      internalCited[link.target] = (internalCited[link.target] || 0) + 1;
    }
  }

  switch (sortBy) {
    case 'similarity':
      if (semanticSearchMode && semanticSearchResults) {
        // semanticSearchResults is already a Map of id -> similarity
        sorted.sort((a, b) => (semanticSearchResults.get(b.id) || 0) - (semanticSearchResults.get(a.id) || 0));
      } else {
        // Default to year desc if no similarity scores
        sorted.sort((a, b) => {
          const yearDiff = (b.year || 0) - (a.year || 0);
          if (yearDiff !== 0) return yearDiff;
          return (internalCited[b.id] || 0) - (internalCited[a.id] || 0);
        });
      }
      break;

    case 'year-desc':
      sorted.sort((a, b) => {
        const yearDiff = (b.year || 0) - (a.year || 0);
        if (yearDiff !== 0) return yearDiff;
        return (internalCited[b.id] || 0) - (internalCited[a.id] || 0);
      });
      break;

    case 'year-asc':
      sorted.sort((a, b) => {
        const yearDiff = (a.year || 0) - (b.year || 0);
        if (yearDiff !== 0) return yearDiff;
        return (internalCited[b.id] || 0) - (internalCited[a.id] || 0);
      });
      break;

    case 'title':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;

    case 'cluster':
      sorted.sort((a, b) => {
        const labelA = clusterLabels[a.cluster] || `Cluster ${a.cluster}`;
        const labelB = clusterLabels[b.cluster] || `Cluster ${b.cluster}`;
        const clusterDiff = labelA.localeCompare(labelB);
        if (clusterDiff !== 0) return clusterDiff;
        return (internalCited[b.id] || 0) - (internalCited[a.id] || 0);
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

  // Close idea dropdowns when clicking outside (added once, not per render)
  document.addEventListener('click', () => {
    const container = document.getElementById('listContainer');
    if (container) {
      container.querySelectorAll('.list-idea-menu.active').forEach(m => {
        m.classList.remove('active');
      });
    }
  });
}

// Helper
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Venue abbreviation map (order matters - more specific patterns first)
const VENUE_ABBREVIATIONS = {
  // HCI - specific patterns first
  'ozchi': 'OzCHI',
  'australian computer-human': 'OzCHI',
  'pacmhci': 'PACMHCI',
  'proc. acm hum.-comput. interact': 'PACMHCI',
  'proceedings of the acm on human-computer': 'PACMHCI',
  'tochi': 'TOCHI',
  'trans. comput.-hum. interact': 'TOCHI',
  'transactions on computer-human interaction': 'TOCHI',
  'acm trans. comput.-hum. interact': 'TOCHI',
  'mobilehci': 'MobileHCI',
  'mobile hci': 'MobileHCI',
  'mobile human-computer': 'MobileHCI',
  'uist': 'UIST',
  'user interface software': 'UIST',
  'symposium on user interface': 'UIST',
  'ubicomp': 'UbiComp',
  'ubiquitous computing': 'UbiComp',
  'imwut': 'IMWUT',
  'interactive, mobile, wearable': 'IMWUT',
  'proc. acm interact. mob. wearable': 'IMWUT',
  'cscw': 'CSCW',
  'computer-supported cooperative': 'CSCW',
  'computer supported cooperative': 'CSCW',
  'extended abstracts': 'CHI EA',
  'chi \'': 'CHI EA',
  'chi\'': 'CHI EA',
  'human factors in computing': 'CHI',
  'conference on human factors': 'CHI',
  'dis ': 'DIS',
  'dis\'': 'DIS',
  'designing interactive systems': 'DIS',
  'iui': 'IUI',
  'intelligent user interfaces': 'IUI',
  'tei': 'TEI',
  'tangible, embedded': 'TEI',
  'nordichi': 'NordiCHI',
  'nordic human-computer': 'NordiCHI',
  // VR/AR
  'ieee vr': 'IEEE VR',
  'virtual reality': 'VR',
  'ismar': 'ISMAR',
  'mixed and augmented reality': 'ISMAR',
  'vrst': 'VRST',
  // AI/ML
  'neurips': 'NeurIPS',
  'neural information processing': 'NeurIPS',
  'icml': 'ICML',
  'international conference on machine learning': 'ICML',
  'iclr': 'ICLR',
  'learning representations': 'ICLR',
  'aaai': 'AAAI',
  'cvpr': 'CVPR',
  'computer vision and pattern': 'CVPR',
  'iccv': 'ICCV',
  'eccv': 'ECCV',
  'naacl': 'NAACL',
  'acl ': 'ACL',
  'acl\'': 'ACL',
  'association for computational linguistics': 'ACL',
  'emnlp': 'EMNLP',
  'empirical methods': 'EMNLP',
  // Graphics
  'siggraph': 'SIGGRAPH',
  'tog': 'TOG',
  'transactions on graphics': 'TOG',
  // Systems
  'sosp': 'SOSP',
  'operating systems principles': 'SOSP',
  'osdi': 'OSDI',
  'systems design': 'OSDI',
  // Web
  'www': 'WWW',
  'world wide web': 'WWW',
  // Other
  'arxiv': 'arXiv',
  'acm computing surveys': 'CSUR',
  'communications of the acm': 'CACM',
  'nature': 'Nature',
  'science': 'Science',
  'pnas': 'PNAS',
  'plos one': 'PLOS ONE',
};

function abbreviateVenue(venue) {
  if (!venue) return '';

  const lower = venue.toLowerCase();

  // Check for known abbreviations
  for (const [pattern, abbrev] of Object.entries(VENUE_ABBREVIATIONS)) {
    if (lower.includes(pattern)) {
      return abbrev;
    }
  }

  // Fallback: truncate long names
  if (venue.length > 30) {
    // Try to extract acronym from parentheses
    const match = venue.match(/\(([A-Z]{2,})\)/);
    if (match) return match[1];

    // Otherwise truncate
    return venue.substring(0, 25) + '...';
  }

  return venue;
}

// Abbreviate author list
function abbreviateAuthors(authors, maxAuthors = 1) {
  if (!authors) return '';

  // Split by common delimiters
  const authorList = authors.split(/[,;]/).map(a => a.trim()).filter(a => a);

  if (authorList.length <= maxAuthors) {
    return authors;
  }

  // First author + et al.
  return `${authorList[0]} et al.`;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initListView);
