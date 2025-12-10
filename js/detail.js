/* ===========================================
   Detail Panel (Desktop & Mobile)
   =========================================== */

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
// Panel Functions
// ============================================================

function clearSelection() {
  selectedPaper = null;
  connectedPapers = new Set();
  updateUrlWithPaper(null);  // Clear paper from URL
  render(currentFiltered);
  showDefaultPanel();
}

function showDefaultPanel() {
  const panel = document.getElementById('detailPanel');
  panel.classList.add('active');
  const savedWidth = localStorage.getItem('detailPanelWidth');
  if (savedWidth) panel.style.width = savedWidth;

  // 닫기 버튼 숨기기
  document.getElementById('closeDetail').style.display = 'none';

  // 통계 계산
  const papers = currentFiltered.length > 0 ? currentFiltered : allPapers;
  const totalPapers = papers.filter(p => p.is_paper).length;
  const totalApps = papers.filter(p => !p.is_paper).length;
  const yearRange = papers.length > 0
    ? `${Math.min(...papers.map(p => p.year).filter(Boolean))} - ${Math.max(...papers.map(p => p.year).filter(Boolean))}`
    : 'N/A';

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

  document.getElementById('detailTitle').textContent = 'Paper Map';
  document.getElementById('detailMeta').innerHTML = `
    <div class="default-stats">
      <div class="stat-row"><strong>📄 Papers:</strong> ${totalPapers}</div>
      <div class="stat-row"><strong>💎 Apps:</strong> ${totalApps}</div>
      <div class="stat-row"><strong>📅 Years:</strong> ${yearRange}</div>
      <div class="stat-row"><strong>🔗 Citations:</strong> ${citationLinks.length}</div>
    </div>
  `;
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

  // 닫기 버튼 숨기기 (호버 미리보기에서는)
  document.getElementById('closeDetail').style.display = 'none';

  document.getElementById('detailTitle').innerHTML = `<span style="opacity: 0.6; font-size: 12px;">Preview</span><br>${item.title || 'Untitled'}`;

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
    ${isIsolated ? `<span class="badge" style="background: #6b728033; color: #6b7280;">🏝️ Isolated</span>` : ''}
    <br><br>
    <span><strong>Year:</strong> ${item.year || 'N/A'}</span>
    <span><strong>Venue:</strong> ${item.venue || 'N/A'}</span>
    ${item.authors ? `<br><span><strong>Authors:</strong> ${item.authors.substring(0, 80)}${item.authors.length > 80 ? '...' : ''}</span>` : ''}
  `;

  let linksHtml = '';
  if (item.url) linksHtml += `<a href="${item.url}" target="_blank">Open URL</a>`;
  if (item.doi) linksHtml += `<a href="https://doi.org/${item.doi}" target="_blank">DOI</a>`;
  document.getElementById('detailLinks').innerHTML = linksHtml;

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
  if (savedWidth) {
    panel.style.width = savedWidth;
  }

  // 닫기 버튼 표시 (선택된 논문이 있을 때)
  document.getElementById('closeDetail').style.display = 'block';

  selectedPaper = item;
  connectedPapers = new Set();

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

  render(currentFiltered);

  const isBookmarked = bookmarkedPapers.has(item.id);
  document.getElementById('detailTitle').innerHTML = `
    <span class="title-text">${item.title || 'Untitled'}</span>
    <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" title="Toggle bookmark">
      ${isBookmarked ? '★' : '☆'}
    </button>
  `;

  // 북마크 버튼 핸들러
  document.querySelector('.bookmark-btn').addEventListener('click', async () => {
    const nowBookmarked = await toggleBookmark(item);
    const btn = document.querySelector('.bookmark-btn');
    btn.textContent = nowBookmarked ? '★' : '☆';
    btn.classList.toggle('active', nowBookmarked);
    render(currentFiltered);
  });

  const typeClass = item.is_paper ? 'paper' : 'app';
  const typeLabel = item.is_paper ? 'Paper' : 'App/Service';

  const citationBadge = item.citation_count !== null && item.citation_count !== undefined
    ? `<span class="badge" style="background: #ffd70033; color: #ffd700;">Global: ${item.citation_count}</span>`
    : '';

  const refsBadge = references.length > 0
    ? `<span class="badge" style="background: #58a6ff33; color: #58a6ff;">Refs: ${references.length}</span>`
    : '';

  const citedByBadge = citedBy.length > 0
    ? `<span class="badge" style="background: #f9731633; color: #f97316;">Cited: ${citedBy.length}</span>`
    : '';

  document.getElementById('detailMeta').innerHTML = `
    <span class="badge ${typeClass}">${typeLabel}</span>
    <span class="badge cluster">Cluster ${item.cluster}: ${item.cluster_label || ''}</span>
    ${citationBadge}
    ${refsBadge}
    ${citedByBadge}
    <br><br>
    <span><strong>Year:</strong> ${item.year || 'N/A'}</span>
    <span><strong>Venue:</strong> ${item.venue || 'N/A'}</span>
    <span><strong>Quality:</strong> ${item.venue_quality}/5</span>
    ${item.citation_count !== null ? `<span><strong>Citations:</strong> ${item.citation_count}</span>` : ''}
    ${item.authors ? `<br><span><strong>Authors:</strong> ${item.authors.substring(0, 100)}${item.authors.length > 100 ? '...' : ''}</span>` : ''}
  `;

  // Tag editor
  const tagEditorHtml = renderTagEditor(item);
  document.getElementById('detailMeta').innerHTML += tagEditorHtml;
  initTagEditor(item);

  let linksHtml = '';
  // Copy Link button first
  linksHtml += `<button class="copy-link-btn" onclick="copyPaperLink('${item.zotero_key}')">Copy Link</button>`;
  if (item.zotero_key) {
    linksHtml += `<a href="${getZoteroUrl(item.zotero_key)}" class="zotero-link">Zotero</a>`;
  }
  if (item.pdf_key) {
    linksHtml += `<a href="${getZoteroPdfUrl(item.pdf_key)}" class="pdf-link">PDF</a>`;
  }
  if (item.url) {
    linksHtml += `<a href="${item.url}" target="_blank">URL</a>`;
  }
  if (item.doi) {
    linksHtml += `<a href="https://doi.org/${item.doi}" target="_blank">DOI</a>`;
  }
  document.getElementById('detailLinks').innerHTML = linksHtml;

  // Update URL with stable zotero_key
  updateUrlWithPaper(item.zotero_key);

  document.getElementById('detailAbstract').textContent =
    item.abstract || 'No abstract available.';

  const notesContent = item.notes_html || item.notes || '';
  const notesHtml = notesContent
    ? `<div class="notes"><h3>Notes</h3><div class="notes-content">${notesContent}</div></div>`
    : '';
  document.getElementById('detailNotes').innerHTML = notesHtml;

  // References 섹션
  const refsSection = document.getElementById('referencesSection');
  if (references.length > 0) {
    let refsHtml = `<h3><span class="dot" style="background: #58a6ff;"></span>References (${references.length})</h3><ul>`;
    references.forEach(p => {
      const title = p.title.length > 50 ? p.title.substring(0, 50) + '...' : p.title;
      refsHtml += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
    });
    refsHtml += '</ul>';
    refsSection.innerHTML = refsHtml;
    refsSection.style.display = 'block';
  } else {
    refsSection.innerHTML = `<h3><span class="dot" style="background: #58a6ff;"></span>References</h3><p class="empty">No references in library</p>`;
    refsSection.style.display = 'block';
  }

  // Cited by 섹션
  const citedBySection = document.getElementById('citedBySection');
  if (citedBy.length > 0) {
    let citedHtml = `<h3><span class="dot" style="background: #f97316;"></span>Cited by (${citedBy.length})</h3><ul>`;
    citedBy.forEach(p => {
      const title = p.title.length > 50 ? p.title.substring(0, 50) + '...' : p.title;
      citedHtml += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
    });
    citedHtml += '</ul>';
    citedBySection.innerHTML = citedHtml;
    citedBySection.style.display = 'block';
  } else {
    citedBySection.innerHTML = `<h3><span class="dot" style="background: #f97316;"></span>Cited by</h3><p class="empty">No citations in library</p>`;
    citedBySection.style.display = 'block';
  }

  // Citation 섹션 클릭 핸들러
  document.querySelectorAll('#referencesSection li, #citedBySection li').forEach(li => {
    li.addEventListener('click', () => {
      const paperId = parseInt(li.dataset.id);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) showDetail(paper);
    });
  });

  // Similar papers
  const similar = findSimilarPapers(item, allPapers, 5);
  let similarHtml = '<h3>Similar Papers</h3><ul>';
  similar.forEach(p => {
    const title = p.title.length > 50 ? p.title.substring(0, 50) + '...' : p.title;
    similarHtml += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
  });
  similarHtml += '</ul>';
  document.getElementById('similarPapers').innerHTML = similarHtml;

  document.querySelectorAll('#similarPapers li').forEach(li => {
    li.addEventListener('click', () => {
      const paperId = parseInt(li.dataset.id);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) showDetail(paper);
    });
  });
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

  render(currentFiltered);

  const isBookmarked = bookmarkedPapers.has(item.id);
  document.getElementById('mobileDetailTitle').innerHTML = `
    <span class="title-text">${item.title || 'Untitled'}</span>
    <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" title="Toggle bookmark">
      ${isBookmarked ? '★' : '☆'}
    </button>
  `;

  // 북마크 버튼 핸들러
  document.querySelector('#bottomSheetContent .bookmark-btn').addEventListener('click', async () => {
    const nowBookmarked = await toggleBookmark(item);
    const btn = document.querySelector('#bottomSheetContent .bookmark-btn');
    btn.textContent = nowBookmarked ? '★' : '☆';
    btn.classList.toggle('active', nowBookmarked);
    render(currentFiltered);
  });

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

  let linksHtml = '';
  linksHtml += `<button class="copy-link-btn" onclick="copyPaperLink('${item.zotero_key}')">Copy Link</button>`;
  if (item.zotero_key) linksHtml += `<a href="${getZoteroUrl(item.zotero_key)}" class="zotero-link">Zotero</a>`;
  if (item.pdf_key) linksHtml += `<a href="${getZoteroPdfUrl(item.pdf_key)}" class="pdf-link">PDF</a>`;
  if (item.url) linksHtml += `<a href="${item.url}" target="_blank">URL</a>`;
  if (item.doi) linksHtml += `<a href="https://doi.org/${item.doi}" target="_blank">DOI</a>`;
  document.getElementById('mobileDetailLinks').innerHTML = linksHtml;

  // Update URL with stable zotero_key
  updateUrlWithPaper(item.zotero_key);

  document.getElementById('mobileDetailAbstract').textContent =
    item.abstract || 'No abstract available.';

  const notesContent = item.notes_html || item.notes || '';
  document.getElementById('mobileDetailNotes').innerHTML = notesContent
    ? `<div class="notes"><h3>Notes</h3><div class="notes-content">${notesContent}</div></div>`
    : '';

  // References
  const refsSection = document.getElementById('mobileReferencesSection');
  if (references.length > 0) {
    let html = `<h3><span class="dot" style="background: #58a6ff;"></span>References (${references.length})</h3><ul>`;
    references.slice(0, 5).forEach(p => {
      const title = p.title.length > 35 ? p.title.substring(0, 35) + '...' : p.title;
      html += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
    });
    if (references.length > 5) html += `<li style="color: var(--text-muted);">+${references.length - 5} more</li>`;
    html += '</ul>';
    refsSection.innerHTML = html;
    refsSection.style.display = 'block';
  } else {
    refsSection.style.display = 'none';
  }

  // Cited by
  const citedBySection = document.getElementById('mobileCitedBySection');
  if (citedBy.length > 0) {
    let html = `<h3><span class="dot" style="background: #f97316;"></span>Cited by (${citedBy.length})</h3><ul>`;
    citedBy.slice(0, 5).forEach(p => {
      const title = p.title.length > 35 ? p.title.substring(0, 35) + '...' : p.title;
      html += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
    });
    if (citedBy.length > 5) html += `<li style="color: var(--text-muted);">+${citedBy.length - 5} more</li>`;
    html += '</ul>';
    citedBySection.innerHTML = html;
    citedBySection.style.display = 'block';
  } else {
    citedBySection.style.display = 'none';
  }

  // Similar
  const similar = findSimilarPapers(item, allPapers, 3);
  let similarHtml = '<h3>Similar</h3><ul>';
  similar.forEach(p => {
    const title = p.title.length > 35 ? p.title.substring(0, 35) + '...' : p.title;
    similarHtml += `<li data-id="${p.id}">${title} <span class="year">(${p.year || 'N/A'})</span></li>`;
  });
  similarHtml += '</ul>';
  document.getElementById('mobileSimilarPapers').innerHTML = similarHtml;

  // Click handlers
  document.querySelectorAll('#bottomSheetContent li[data-id]').forEach(li => {
    li.addEventListener('click', () => {
      const paperId = parseInt(li.dataset.id);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper) showMobileDetail(paper);
    });
  });

  openBottomSheet();
}
