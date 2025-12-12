/* ===========================================
   Detail Panel (Desktop & Mobile)
   =========================================== */

// ============================================================
// View-Aware Rendering Helper
// ============================================================

function renderCurrentView() {
  // Include selected paper and connected papers even if they're filtered out
  let papersToRender = currentFiltered;

  if (selectedPaper !== null) {
    const filteredIds = new Set(currentFiltered.map(p => p.id));

    // Add selected paper if filtered out
    if (!filteredIds.has(selectedPaper.id)) {
      papersToRender = [...papersToRender, selectedPaper];
      filteredIds.add(selectedPaper.id);
    }

    // Add connected papers if filtered out
    if (connectedPapers.size > 0) {
      const missingConnected = allPapers.filter(p =>
        connectedPapers.has(p.id) && !filteredIds.has(p.id)
      );
      if (missingConnected.length > 0) {
        papersToRender = [...papersToRender, ...missingConnected];
      }
    }
  }

  if (currentView === 'timeline') {
    renderTimeline(papersToRender);
  } else if (currentView === 'list') {
    renderListView(currentFiltered);  // List view keeps filtered only
  } else {
    render(papersToRender);
  }
}

// ============================================================
// Zotero Deep Link Helper
// ============================================================

function getZoteroUrl(zoteroKey) {
  // Uses dataMeta from state.js (global)
  const libraryType = dataMeta.zotero_library_type || 'user';
  const libraryId = dataMeta.zotero_library_id || '';

  if (libraryType === 'group' && libraryId) {
    return `zotero://select/groups/${libraryId}/items/${zoteroKey}`;
  } else {
    return `zotero://select/library/items/${zoteroKey}`;
  }
}

function getZoteroPdfUrl(pdfKey) {
  // Opens PDF directly in Zotero
  const libraryType = dataMeta.zotero_library_type || 'user';
  const libraryId = dataMeta.zotero_library_id || '';

  if (libraryType === 'group' && libraryId) {
    return `zotero://open-pdf/groups/${libraryId}/items/${pdfKey}`;
  } else {
    return `zotero://open-pdf/library/items/${pdfKey}`;
  }
}

// ============================================================
// URL / Permalink Helper (uses zotero_key for stable URLs)
// ============================================================

function getPaperUrl(zoteroKey) {
  const url = new URL(window.location.href);
  url.searchParams.set('paper', zoteroKey);
  return url.toString();
}

function updateUrlWithPaper(zoteroKey) {
  const url = new URL(window.location.href);
  if (zoteroKey !== null) {
    url.searchParams.set('paper', zoteroKey);
  } else {
    url.searchParams.delete('paper');
  }
  window.history.replaceState({}, '', url.toString());
}

function getPaperKeyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('paper');  // returns zotero_key string or null
}

function copyPaperLink(zoteroKey) {
  const url = getPaperUrl(zoteroKey);
  navigator.clipboard.writeText(url).then(() => {
    // Show brief feedback
    const btn = document.querySelector('.copy-link-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    }
  });
}

// ============================================================
// Tag Editor
// ============================================================

function renderTagEditor(item) {
  const currentTags = item.tags
    ? item.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean)
    : [];

  const tagsHtml = currentTags.map(tag => `
    <span class="tag-chip" data-tag="${tag}">
      ${tag}
      <button class="tag-remove" data-tag="${tag}" title="Remove tag">&times;</button>
    </span>
  `).join('');

  return `
    <div class="tag-editor" data-zotero-key="${item.zotero_key || ''}" data-paper-id="${item.id}">
      <div class="tag-label"><strong>Tags:</strong></div>
      <div class="tag-list">${tagsHtml || '<span class="no-tags">No tags</span>'}</div>
      <div class="tag-input-container">
        <input type="text" class="tag-input" placeholder="Add tag..." autocomplete="off">
        <div class="tag-autocomplete"></div>
      </div>
    </div>
  `;
}

function initTagEditor(item) {
  const editor = document.querySelector('.tag-editor');
  if (!editor) return;

  const input = editor.querySelector('.tag-input');
  const autocomplete = editor.querySelector('.tag-autocomplete');
  const tagList = editor.querySelector('.tag-list');
  const zoteroKey = editor.dataset.zoteroKey;
  const paperId = parseInt(editor.dataset.paperId);

  // Current tags
  let currentTags = item.tags
    ? item.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean)
    : [];

  // Remove tag handler
  tagList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('tag-remove')) {
      const tagToRemove = e.target.dataset.tag;
      currentTags = currentTags.filter(t => t !== tagToRemove);
      await saveTagsToZotero(zoteroKey, currentTags, paperId);
      updateTagDisplay();
    }
  });

  // Input handlers
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (query.length === 0) {
      autocomplete.classList.remove('active');
      return;
    }

    // Filter tags from allTags
    const suggestions = [...allTags]
      .filter(tag => tag.toLowerCase().includes(query) && !currentTags.includes(tag))
      .slice(0, 8);

    if (suggestions.length === 0) {
      autocomplete.classList.remove('active');
      return;
    }

    autocomplete.innerHTML = suggestions.map(tag =>
      `<div class="tag-autocomplete-item" data-tag="${tag}">${tag}</div>`
    ).join('');
    autocomplete.classList.add('active');
  });

  // Autocomplete selection
  autocomplete.addEventListener('click', async (e) => {
    if (e.target.classList.contains('tag-autocomplete-item')) {
      const tag = e.target.dataset.tag;
      if (!currentTags.includes(tag)) {
        currentTags.push(tag);
        await saveTagsToZotero(zoteroKey, currentTags, paperId);
        updateTagDisplay();
      }
      input.value = '';
      autocomplete.classList.remove('active');
    }
  });

  // Enter to add new tag
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = input.value.trim();
      if (tag && !currentTags.includes(tag)) {
        currentTags.push(tag);
        await saveTagsToZotero(zoteroKey, currentTags, paperId);
        updateTagDisplay();
      }
      input.value = '';
      autocomplete.classList.remove('active');
    } else if (e.key === 'Escape') {
      autocomplete.classList.remove('active');
    }
  });

  // Close autocomplete on outside click
  document.addEventListener('click', (e) => {
    if (!editor.contains(e.target)) {
      autocomplete.classList.remove('active');
    }
  });

  function updateTagDisplay() {
    const tagsHtml = currentTags.map(tag => `
      <span class="tag-chip" data-tag="${tag}">
        ${tag}
        <button class="tag-remove" data-tag="${tag}" title="Remove tag">&times;</button>
      </span>
    `).join('');
    tagList.innerHTML = tagsHtml || '<span class="no-tags">No tags</span>';
  }
}

async function saveTagsToZotero(zoteroKey, tags, paperId) {
  if (!zoteroKey) {
    showToast('Error', 'No Zotero key - cannot sync');
    return;
  }

  try {
    const result = await updatePaperTags(zoteroKey, tags);
    if (result.success) {
      // Update local state
      updateLocalPaperTags(paperId, tags);
      showToast('Tags saved', tags.join(', ') || 'No tags');
    }
  } catch (e) {
    showToast('Error', e.message);
  }
}

// ============================================================
// Shared Detail Helpers
// ============================================================

// Build citation lists from citationLinks
function buildCitationLists(item) {
  const references = [];
  const citedBy = [];

  citationLinks.forEach(link => {
    if (link.source === item.id) {
      connectedPapers.add(link.target);
      const refPaper = allPapers.find(p => p.id === link.target);
      if (refPaper) references.push(refPaper);
    }
    if (link.target === item.id) {
      connectedPapers.add(link.source);
      const citingPaper = allPapers.find(p => p.id === link.source);
      if (citingPaper) citedBy.push(citingPaper);
    }
  });

  return { references, citedBy };
}

// Render citation section HTML
function renderCitationSectionHtml(papers, title, color, maxItems = null, titleMaxLen = 50) {
  const displayPapers = maxItems ? papers.slice(0, maxItems) : papers;
  const hasMore = maxItems && papers.length > maxItems;

  if (papers.length === 0) {
    return { html: `<h3><span class="dot" style="background: ${color};"></span>${title}</h3><p class="empty">None in library</p>`, hasItems: false };
  }

  let html = `<h3><span class="dot" style="background: ${color};"></span>${title} (${papers.length})</h3><ul>`;
  displayPapers.forEach(p => {
    const truncTitle = p.title.length > titleMaxLen ? p.title.substring(0, titleMaxLen) + '...' : p.title;
    html += `<li data-id="${p.id}">${truncTitle} <span class="year">(${p.year || 'N/A'})</span></li>`;
  });
  if (hasMore) html += `<li style="color: var(--text-muted);">+${papers.length - maxItems} more</li>`;
  html += '</ul>';

  return { html, hasItems: true };
}

// Render similar papers section
function renderSimilarPapersHtml(item, count = 5, titleMaxLen = 50) {
  const similar = findSimilarPapers(item, allPapers, count);
  let html = '<h3>Similar Papers</h3><ul>';
  similar.forEach(p => {
    const title = p.title.length > titleMaxLen ? p.title.substring(0, titleMaxLen) + '...' : p.title;
    html += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
  });
  html += '</ul>';
  return html;
}

// Setup bookmark button with click handler (using cloneNode to remove old listeners)
function setupBookmarkButton(btn, item, onUpdate) {
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    const nowBookmarked = await toggleBookmark(item);
    newBtn.innerHTML = `<i data-lucide="star" ${nowBookmarked ? 'class="filled"' : ''}></i>`;
    newBtn.classList.toggle('active', nowBookmarked);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (onUpdate) onUpdate();
  });

  return newBtn;
}

// Attach click handlers to paper list items
function attachPaperListClickHandlers(containerSelector, onPaperClick) {
  document.querySelectorAll(`${containerSelector} li[data-id]`).forEach(li => {
    li.addEventListener('click', () => {
      const paperId = parseInt(li.dataset.id);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) onPaperClick(paper);
    });
  });
}

// Generate links HTML for a paper
function renderLinksHtml(item, includeCopyLink = true) {
  let html = '';
  if (includeCopyLink) {
    html += `<button class="copy-link-btn" onclick="copyPaperLink('${item.zotero_key}')">Copy Link</button>`;
  }
  if (item.zotero_key) html += `<a href="${getZoteroUrl(item.zotero_key)}" class="zotero-link">Zotero</a>`;
  if (item.pdf_key) html += `<a href="${getZoteroPdfUrl(item.pdf_key)}" class="pdf-link">PDF</a>`;
  if (item.url) html += `<a href="${item.url}" target="_blank">URL</a>`;
  if (item.doi) html += `<a href="https://doi.org/${item.doi}" target="_blank">DOI</a>`;
  return html;
}

function setupDetailIdeaDropdown(item) {
  const dropdown = document.getElementById('detailIdeaDropdown');
  if (!dropdown || !item) return;

  const btn = document.getElementById('detailIdeaBtn');
  const menu = document.getElementById('detailIdeaMenu');
  if (!btn || !menu) return;

  const zoteroKey = item.zotero_key;

  // Update button state
  const connectedIdeas = (typeof allIdeas !== 'undefined' ? allIdeas : [])
    .filter(idea => idea.connected_papers?.includes(zoteroKey));
  btn.classList.toggle('has-ideas', connectedIdeas.length > 0);
  btn.title = connectedIdeas.length > 0 ? 'Connected: ' + connectedIdeas.map(i => i.title).join(', ') : 'Link to idea';
  btn.innerHTML = `<i data-lucide="lightbulb"></i>${connectedIdeas.length > 0 ? `<span class="idea-count">${connectedIdeas.length}</span>` : ''}`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Clone button to remove old listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // Close other menus
    document.querySelectorAll('.list-idea-menu.active').forEach(m => {
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
            <span>${idea.title}</span>
          </div>
        `;
      }).join('');

      menu.querySelectorAll('.idea-menu-item').forEach(menuItem => {
        menuItem.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ideaKey = menuItem.dataset.ideaKey;
          const isConnected = menuItem.classList.contains('connected');

          // Loading state
          menuItem.classList.add('loading');
          const icon = menuItem.querySelector('[data-lucide]');
          if (icon) icon.setAttribute('data-lucide', 'loader');
          if (typeof lucide !== 'undefined') lucide.createIcons();

          let result;
          if (isConnected) {
            result = await removePaperFromIdea(ideaKey, zoteroKey);
          } else {
            result = await addPaperToIdea(ideaKey, zoteroKey);
          }

          // Show result
          if (icon) icon.setAttribute('data-lucide', result !== null ? 'check' : 'x');
          if (typeof lucide !== 'undefined') lucide.createIcons();

          setTimeout(() => {
            menu.classList.remove('active');

            // Refresh the idea button state
            if (selectedPaper) {
              setupDetailIdeaDropdown(selectedPaper);
            }

            if (result !== null && typeof selectIdea === 'function') {
              const idea = allIdeas.find(i => i.zotero_key === ideaKey);
              if (idea) {
                const ideasSection = document.getElementById('ideasSection');
                if (ideasSection?.classList.contains('collapsed')) {
                  ideasSection.classList.remove('collapsed');
                }
                selectIdea(idea);
              }
            }
          }, 300);
        });
      });
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    menu.classList.toggle('active');
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      menu.classList.remove('active');
    }
  });
}

// ============================================================
// Panel Functions
// ============================================================

function clearSelection() {
  selectedPaper = null;
  connectedPapers = new Set();
  updateUrlWithPaper(null);  // Clear paper from URL
  renderCurrentView();
  showDefaultPanel();
}

function showDefaultPanel() {
  const panel = document.getElementById('detailPanel');
  panel.classList.add('active');
  const savedWidth = localStorage.getItem('detailPanelWidth');
  if (savedWidth) panel.style.width = savedWidth;

  // 닫기 버튼, 액션 버튼들 숨기기
  document.getElementById('closeDetail').style.display = 'none';
  const detailActions = document.getElementById('detailActions');
  if (detailActions) detailActions.style.display = 'none';

  // 통계 계산
  const papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
  const isFiltered = currentFiltered.length > 0 && currentFiltered.length < allPapers.length;

  // Filtered counts
  const filteredPapers = papers.filter(p => p.is_paper).length;
  const filteredApps = papers.filter(p => !p.is_paper).length;
  const filteredYearRange = papers.length > 0
    ? `${Math.min(...papers.map(p => p.year).filter(Boolean))} - ${Math.max(...papers.map(p => p.year).filter(Boolean))}`
    : 'N/A';

  // Total counts (from allPapers)
  const allPapersCount = allPapers.filter(p => p.is_paper).length;
  const allAppsCount = allPapers.filter(p => !p.is_paper).length;
  const allYearRange = allPapers.length > 0
    ? `${Math.min(...allPapers.map(p => p.year).filter(Boolean))} - ${Math.max(...allPapers.map(p => p.year).filter(Boolean))}`
    : 'N/A';

  // Citations between filtered papers
  const filteredIds = new Set(papers.map(p => p.id));
  const filteredCitations = citationLinks.filter(
    link => filteredIds.has(link.source) && filteredIds.has(link.target)
  ).length;

  // 클러스터별 통계
  const clusterStats = {};
  papers.forEach(p => {
    if (!clusterStats[p.cluster]) {
      clusterStats[p.cluster] = { count: 0, label: p.cluster_label || '' };
    }
    clusterStats[p.cluster].count++;
  });

  let clusterHtml = Object.entries(clusterStats)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([c, s]) => `<div class="stat-row"><span style="color: ${CLUSTER_COLORS[c % CLUSTER_COLORS.length]}">●</span> ${s.label || 'Cluster ' + c}: ${s.count}</div>`)
    .join('');

  // Check active filters - build chips with icons like header
  const activeFilterChips = [];

  const searchFilter = document.getElementById('searchFilter')?.value?.trim();
  const yearMin = parseInt(document.getElementById('yearMin')?.value) || 0;
  const yearMax = parseInt(document.getElementById('yearMax')?.value) || 9999;
  const clusterFilter = document.getElementById('clusterFilter')?.value;
  const minVenue = parseInt(document.getElementById('minVenue')?.value) || 0;
  const papersOnly = document.getElementById('papersOnly')?.checked;
  const bookmarkedOnly = document.getElementById('bookmarkedOnly')?.checked;
  const tagFilter = document.getElementById('tagFilter')?.value;

  if (searchFilter) {
    const displayText = searchFilter.length > 15 ? searchFilter.substring(0, 15) + '...' : searchFilter;
    const iconName = typeof semanticSearchMode !== 'undefined' && semanticSearchMode ? 'brain' : 'search';
    activeFilterChips.push(`<span class="filter-chip search"><i data-lucide="${iconName}"></i> "${displayText}"</span>`);
  }
  if (yearMin > 1900 || yearMax < 2100) {
    activeFilterChips.push(`<span class="filter-chip year"><i data-lucide="calendar"></i> ${yearMin}-${yearMax}</span>`);
  }
  if (typeof highlightCluster !== 'undefined' && highlightCluster !== null) {
    const label = typeof clusterLabels !== 'undefined' && clusterLabels[highlightCluster] ? clusterLabels[highlightCluster] : `Cluster ${highlightCluster}`;
    activeFilterChips.push(`<span class="filter-chip cluster"><i data-lucide="map-pin"></i> ${label}</span>`);
  }
  if (tagFilter) {
    activeFilterChips.push(`<span class="filter-chip tag"><i data-lucide="tag"></i> ${tagFilter}</span>`);
  }
  if (bookmarkedOnly) {
    activeFilterChips.push(`<span class="filter-chip"><i data-lucide="star"></i> Bookmarked</span>`);
  }

  const filterStatusHtml = activeFilterChips.length > 0 ? `
    <div class="filter-status-box">
      <div class="active-filters">${activeFilterChips.join('')}</div>
    </div>
  ` : '';

  document.getElementById('detailTitle').textContent = 'Paper Map';
  document.getElementById('detailMeta').innerHTML = `
    ${filterStatusHtml}
    <div class="default-stats">
      <div class="stat-row"><strong><i data-lucide="file-text"></i> Papers:</strong> ${filteredPapers}${isFiltered ? ` <span class="stat-total">/ ${allPapersCount}</span>` : ''}</div>
      <div class="stat-row"><strong><i data-lucide="gem"></i> Apps:</strong> ${filteredApps}${isFiltered ? ` <span class="stat-total">/ ${allAppsCount}</span>` : ''}</div>
      <div class="stat-row"><strong><i data-lucide="calendar"></i> Years:</strong> ${filteredYearRange}${isFiltered && filteredYearRange !== allYearRange ? ` <span class="stat-total">/ ${allYearRange}</span>` : ''}</div>
      <div class="stat-row"><strong><i data-lucide="link"></i> Citations:</strong> ${filteredCitations}${isFiltered ? ` <span class="stat-total">/ ${citationLinks.length}</span>` : ''}</div>
    </div>
  `;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  document.getElementById('detailLinks').innerHTML = '';
  document.getElementById('detailAbstract').innerHTML = `
    <div class="help-section">
      <h4>Usage</h4>
      <ul>
        <li><strong>Click</strong> node: View details</li>
        <li><strong>Hover</strong>: Citation preview</li>
        <li><strong>Double-click</strong>: Reset zoom</li>
        <li>Click cluster: Filter</li>
      </ul>
    </div>
  `;
  document.getElementById('detailNotes').innerHTML = `
    <div class="cluster-overview">
      <h4>Cluster Distribution</h4>
      ${clusterHtml}
    </div>
  `;
  document.getElementById('referencesSection').style.display = 'none';
  document.getElementById('citedBySection').style.display = 'none';
  document.getElementById('similarPapers').innerHTML = '';
}

function showHoverPreview(item) {
  if (selectedPaper !== null) return; // 선택된 게 있으면 무시
  if (window.innerWidth <= MOBILE_BREAKPOINT) return;

  const panel = document.getElementById('detailPanel');
  panel.classList.add('active');

  // 닫기 버튼, 액션 버튼들 숨기기 (호버 미리보기에서는)
  document.getElementById('closeDetail').style.display = 'none';
  const hoverDetailActions = document.getElementById('detailActions');
  if (hoverDetailActions) hoverDetailActions.style.display = 'none';

  document.getElementById('detailTitle').textContent = item.title || 'Untitled';

  const typeClass = item.is_paper ? 'paper' : 'app';
  const typeLabel = item.is_paper ? 'Paper' : 'App/Service';

  // 내부 인용 관계 확인
  const hasRefs = citationLinks.some(l => l.source === item.id);
  const hasCitedBy = citationLinks.some(l => l.target === item.id);
  const isIsolated = !hasRefs && !hasCitedBy;

  document.getElementById('detailMeta').innerHTML = `
    <span class="badge ${typeClass}">${typeLabel}</span>
    <span class="badge cluster">Cluster ${item.cluster}</span>
    ${item.citation_count ? `<span class="badge" style="background: #ffd70033; color: #ffd700;">${item.citation_count} cited</span>` : ''}
    ${isIsolated ? `<span class="badge" style="background: #6b728033; color: #6b7280;"><i data-lucide="unplug" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i>Isolated</span>` : ''}
    <br><br>
    <span><strong>Year:</strong> ${item.year || 'N/A'}</span>
    <span><strong>Venue:</strong> ${item.venue || 'N/A'}</span>
    ${item.authors ? `<br><span><strong>Authors:</strong> ${item.authors.substring(0, 80)}${item.authors.length > 80 ? '...' : ''}</span>` : ''}
  `;

  // Hide links in preview
  document.getElementById('detailLinks').innerHTML = '';

  const abstract = item.abstract || 'No abstract available.';
  document.getElementById('detailAbstract').textContent =
    abstract.length > 300 ? abstract.substring(0, 300) + '...' : abstract;

  // Notes preview
  const notesContent = item.notes_html || item.notes || '';
  if (notesContent) {
    // Extract multiple paragraphs from notes
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = notesContent;
    const paragraphs = tempDiv.querySelectorAll('p');
    let noteText = '';
    if (paragraphs.length > 0) {
      // Get up to 3 paragraphs
      for (let i = 0; i < Math.min(paragraphs.length, 3); i++) {
        noteText += paragraphs[i].textContent + '\n\n';
      }
      noteText = noteText.trim();
    } else {
      noteText = tempDiv.textContent;
    }
    const truncatedNote = noteText.length > 800 ? noteText.substring(0, 800) + '...' : noteText;
    document.getElementById('detailNotes').innerHTML = `
      <div class="notes"><h3>Notes</h3><div class="notes-content" style="max-height: 300px; white-space: pre-wrap;">${truncatedNote}</div></div>
    `;
  } else {
    document.getElementById('detailNotes').innerHTML = '';
  }
  document.getElementById('referencesSection').style.display = 'none';
  document.getElementById('citedBySection').style.display = 'none';
  document.getElementById('similarPapers').innerHTML = '';
}

function showDetail(item) {
  // Mobile: use bottom sheet
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    showMobileDetail(item);
    return;
  }

  const panel = document.getElementById('detailPanel');
  panel.classList.add('active');
  const savedWidth = localStorage.getItem('detailPanelWidth');
  if (savedWidth) panel.style.width = savedWidth;

  document.getElementById('closeDetail').style.display = 'block';

  selectedPaper = item;
  connectedPapers = new Set();
  const { references, citedBy } = buildCitationLists(item);
  renderCurrentView();

  // Title & action buttons
  const isBookmarked = bookmarkedPapers.has(item.id);
  document.getElementById('detailTitle').textContent = item.title || 'Untitled';

  // Show action buttons
  const detailActions = document.getElementById('detailActions');
  if (detailActions) detailActions.style.display = '';

  const bookmarkBtn = document.getElementById('bookmarkBtn');
  bookmarkBtn.innerHTML = `<i data-lucide="star" ${isBookmarked ? 'class="filled"' : ''}></i>`;
  bookmarkBtn.classList.toggle('active', isBookmarked);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  setupBookmarkButton(bookmarkBtn, item, renderCurrentView);

  // Setup idea dropdown
  setupDetailIdeaDropdown(item);

  // Meta - compact list view style
  const clusterColor = CLUSTER_COLORS[item.cluster % CLUSTER_COLORS.length];
  const venueAbbrev = typeof abbreviateVenue === 'function' ? abbreviateVenue(item.venue) : (item.venue || '');
  const authorsAbbrev = typeof abbreviateAuthors === 'function' ? abbreviateAuthors(item.authors) : (item.authors?.split(/[,;]/)[0] || '');

  document.getElementById('detailMeta').innerHTML = `
    <div class="detail-meta-line">
      <span class="detail-year">${item.year || '?'}</span>
      <span class="detail-cluster" style="background: ${clusterColor};">${item.cluster_label || 'C' + item.cluster}</span>
      <span class="detail-authors">${authorsAbbrev}</span>
      <span class="detail-venue" title="${item.venue || ''}">${venueAbbrev}</span>
    </div>
    <div class="detail-stats">
      ${item.citation_count ? `<span class="detail-stat" title="Total citations"><i data-lucide="quote"></i> ${item.citation_count}</span>` : ''}
      ${citedBy.length > 0 ? `<span class="detail-stat cited" title="Cited by ${citedBy.length} in library"><i data-lucide="arrow-left"></i> ${citedBy.length}</span>` : ''}
      ${references.length > 0 ? `<span class="detail-stat refs" title="References ${references.length} in library"><i data-lucide="arrow-right"></i> ${references.length}</span>` : ''}
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Tag editor
  document.getElementById('detailTags').innerHTML = renderTagEditor(item);
  initTagEditor(item);

  // Links
  document.getElementById('detailLinks').innerHTML = renderLinksHtml(item);
  updateUrlWithPaper(item.zotero_key);

  // Abstract & Notes
  document.getElementById('detailAbstract').textContent = item.abstract || 'No abstract available.';
  const notesContent = item.notes_html || item.notes || '';
  document.getElementById('detailNotes').innerHTML = notesContent
    ? `<div class="notes"><h3>Notes</h3><div class="notes-content">${notesContent}</div></div>`
    : '';

  // References & Cited by sections
  const refsSection = document.getElementById('referencesSection');
  const refsResult = renderCitationSectionHtml(references, 'References', '#58a6ff', null, 50);
  refsSection.innerHTML = refsResult.html;
  refsSection.style.display = 'block';

  const citedBySection = document.getElementById('citedBySection');
  const citedResult = renderCitationSectionHtml(citedBy, 'Cited by', '#f97316', null, 50);
  citedBySection.innerHTML = citedResult.html;
  citedBySection.style.display = 'block';

  attachPaperListClickHandlers('#referencesSection, #citedBySection', showDetail);

  // Similar papers
  document.getElementById('similarPapers').innerHTML = renderSimilarPapersHtml(item, 5, 50);
  attachPaperListClickHandlers('#similarPapers', showDetail);
}

function findSimilarPapers(target, papers, n = 5) {
  return papers
    .filter(p => p.id !== target.id)
    .map(p => ({
      ...p,
      distance: Math.sqrt(Math.pow(p.x - target.x, 2) + Math.pow(p.y - target.y, 2))
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

function showMobileDetail(item) {
  selectedPaper = item;
  connectedPapers = new Set();
  const { references, citedBy } = buildCitationLists(item);
  renderCurrentView();

  // Title & bookmark
  const isBookmarked = bookmarkedPapers.has(item.id);
  document.getElementById('mobileDetailTitle').innerHTML = `
    <span class="title-text">${item.title || 'Untitled'}</span>
    <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" title="Toggle bookmark">
      <i data-lucide="star" ${isBookmarked ? 'class="filled"' : ''}></i>
    </button>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const mobileBookmarkBtn = document.querySelector('#bottomSheetContent .bookmark-btn');
  setupBookmarkButton(mobileBookmarkBtn, item, renderCurrentView);

  // Meta badges
  const typeClass = item.is_paper ? 'paper' : 'app';
  const typeLabel = item.is_paper ? 'Paper' : 'App';

  document.getElementById('mobileDetailMeta').innerHTML = `
    <span class="badge ${typeClass}">${typeLabel}</span>
    <span class="badge cluster">C${item.cluster}</span>
    ${item.citation_count ? `<span class="badge" style="background: #ffd70033; color: #ffd700;">${item.citation_count} cited</span>` : ''}
    <br><br>
    <span><strong>Year:</strong> ${item.year || 'N/A'}</span>
    <span><strong>Venue:</strong> ${item.venue || 'N/A'}</span>
    ${item.authors ? `<br><span style="font-size: 11px;"><strong>Authors:</strong> ${item.authors.substring(0, 60)}${item.authors.length > 60 ? '...' : ''}</span>` : ''}
  `;

  // Links
  document.getElementById('mobileDetailLinks').innerHTML = renderLinksHtml(item);
  updateUrlWithPaper(item.zotero_key);

  // Abstract & Notes
  document.getElementById('mobileDetailAbstract').textContent = item.abstract || 'No abstract available.';
  const notesContent = item.notes_html || item.notes || '';
  document.getElementById('mobileDetailNotes').innerHTML = notesContent
    ? `<div class="notes"><h3>Notes</h3><div class="notes-content">${notesContent}</div></div>`
    : '';

  // References (mobile: max 5, shorter titles)
  const refsSection = document.getElementById('mobileReferencesSection');
  const refsResult = renderCitationSectionHtml(references, 'References', '#58a6ff', 5, 35);
  refsSection.innerHTML = refsResult.html;
  refsSection.style.display = refsResult.hasItems ? 'block' : 'none';

  // Cited by
  const citedBySection = document.getElementById('mobileCitedBySection');
  const citedResult = renderCitationSectionHtml(citedBy, 'Cited by', '#f97316', 5, 35);
  citedBySection.innerHTML = citedResult.html;
  citedBySection.style.display = citedResult.hasItems ? 'block' : 'none';

  // Similar (mobile: 3 items)
  document.getElementById('mobileSimilarPapers').innerHTML = renderSimilarPapersHtml(item, 3, 35);

  // Click handlers
  attachPaperListClickHandlers('#bottomSheetContent', showMobileDetail);

  openBottomSheet();
}
