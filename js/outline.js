/* ===========================================
   Outline Builder JavaScript
   =========================================== */

// State
let currentOutline = null;
let allOutlines = [];
let papers = [];
let selectedBlockId = null;
let pendingPaper = null;
let isSemanticSearch = true;
let editingClaimBlockId = null;
let collapsedBlocks = new Set();
let draggedBlockId = null;

// DOM Elements
const outlineSelect = document.getElementById('outlineSelect');
const outlineTitle = document.getElementById('outlineTitle');
const thesisInput = document.getElementById('thesisInput');
const blocksList = document.getElementById('blocksList');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const detailSection = document.getElementById('detailSection');
const paperDetail = document.getElementById('paperDetail');

// ===========================================
// API Functions
// ===========================================

async function fetchOutlines() {
  const key = localStorage.getItem('app_api_key');
  const response = await fetch('/api/outlines', {
    headers: { 'X-API-Key': key }
  });
  const data = await response.json();
  if (data.success) {
    allOutlines = data.outlines;
    return data.outlines;
  }
  return [];
}

async function fetchOutline(id) {
  const key = localStorage.getItem('app_api_key');
  const response = await fetch(`/api/outlines/${id}`, {
    headers: { 'X-API-Key': key }
  });
  const data = await response.json();
  if (data.success) {
    return data.outline;
  }
  return null;
}

async function createOutlineAPI(title) {
  const key = localStorage.getItem('app_api_key');
  const response = await fetch('/api/outlines', {
    method: 'POST',
    headers: {
      'X-API-Key': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });
  const data = await response.json();
  if (data.success) {
    return data.outline;
  }
  return null;
}

async function updateOutlineAPI(id, updates) {
  const key = localStorage.getItem('app_api_key');
  const response = await fetch(`/api/outlines/${id}`, {
    method: 'PUT',
    headers: {
      'X-API-Key': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  const data = await response.json();
  return data.success;
}

async function deleteOutlineAPI(id) {
  const key = localStorage.getItem('app_api_key');
  const response = await fetch(`/api/outlines/${id}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': key }
  });
  const data = await response.json();
  return data.success;
}

async function loadPapers() {
  try {
    const response = await fetch('/papers.json');
    const data = await response.json();
    papers = data.papers || data;
    return papers;
  } catch (e) {
    console.error('Failed to load papers:', e);
    return [];
  }
}

async function semanticSearch(query, topK = 20) {
  try {
    const response = await fetch(`/api/semantic-search?q=${encodeURIComponent(query)}&top_k=${topK}`);
    const data = await response.json();
    if (data.results) {
      return data.results;
    }
    return [];
  } catch (e) {
    console.error('Semantic search failed:', e);
    return [];
  }
}

// ===========================================
// Ideas Integration
// ===========================================

let allIdeas = [];

async function fetchIdeas() {
  try {
    const response = await fetch('/api/ideas');
    const data = await response.json();
    if (data.success) {
      allIdeas = data.ideas || [];
      return allIdeas;
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch ideas:', e);
    return [];
  }
}

function showImportIdeasModal() {
  if (allIdeas.length === 0) {
    alert('No ideas found. Create ideas in the Explorer first.');
    return;
  }

  const modal = document.getElementById('importIdeasModal');
  const list = document.getElementById('ideasList');

  list.innerHTML = allIdeas.map(idea => `
    <div class="idea-item" data-idea-key="${idea.zotero_key}">
      <div class="idea-item-title">${escapeHtml(idea.title || 'Untitled')}</div>
      <div class="idea-item-meta">
        ${idea.connected_papers?.length || 0} papers connected
        ${idea.status ? `· ${idea.status}` : ''}
      </div>
    </div>
  `).join('');

  modal.style.display = 'flex';

  // Add click listeners
  list.querySelectorAll('.idea-item').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.ideaKey;
      importIdeaAsBlock(key);
      modal.style.display = 'none';
    });
  });
}

function openEditClaimModal(blockId, currentClaim, blockTitle) {
  editingClaimBlockId = blockId;

  const modal = document.getElementById('editClaimModal');
  const titleEl = document.getElementById('editClaimTitle');
  const input = document.getElementById('editClaimInput');

  titleEl.textContent = blockTitle || 'Edit Description';
  input.value = currentClaim;
  modal.style.display = 'flex';

  // Focus and select all text
  setTimeout(() => {
    input.focus();
    input.setSelectionRange(0, input.value.length);
  }, 50);
}

function closeEditClaimModal() {
  document.getElementById('editClaimModal').style.display = 'none';
  editingClaimBlockId = null;
}

function saveEditClaim() {
  if (!currentOutline || !editingClaimBlockId) return;

  const input = document.getElementById('editClaimInput');
  const block = currentOutline.blocks.find(b => b.id === editingClaimBlockId);

  if (block) {
    block.claim = input.value;
    saveOutline();
    renderOutline();
  }

  closeEditClaimModal();
}

function importIdeaAsBlock(ideaKey) {
  if (!currentOutline) {
    alert('Please select or create an outline first.');
    return;
  }

  const idea = allIdeas.find(i => i.zotero_key === ideaKey);
  if (!idea) return;

  // Create block from idea
  const newBlock = {
    id: generateId(),
    title: idea.title || '',
    claim: idea.description || '',
    papers: [],
    sourceIdea: ideaKey  // Track the source idea
  };

  // Add connected papers
  if (idea.connected_papers && idea.connected_papers.length > 0) {
    idea.connected_papers.forEach(paperKey => {
      const paper = papers.find(p => p.zotero_key === paperKey);
      if (paper) {
        newBlock.papers.push({
          zotero_key: paperKey,
          paper_id: paper.id,
          note: ''  // User can add notes later
        });
      }
    });
  }

  if (!currentOutline.blocks) {
    currentOutline.blocks = [];
  }

  currentOutline.blocks.push(newBlock);
  saveOutline();
  renderOutline();
}

// ===========================================
// UI Rendering
// ===========================================

function renderOutlineSelect() {
  outlineSelect.innerHTML = '<option value="">Select outline...</option>';
  allOutlines.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.title || 'Untitled';
    outlineSelect.appendChild(opt);
  });

  if (currentOutline) {
    outlineSelect.value = currentOutline.id;
  }
}

function renderOutline() {
  if (!currentOutline) {
    outlineTitle.value = '';
    thesisInput.value = '';
    blocksList.innerHTML = `
      <div class="blocks-empty">
        <i data-lucide="file-text"></i>
        <p>Create or select an outline to get started</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  outlineTitle.value = currentOutline.title || '';
  thesisInput.value = currentOutline.thesis || '';

  if (!currentOutline.blocks || currentOutline.blocks.length === 0) {
    blocksList.innerHTML = `
      <div class="blocks-empty">
        <i data-lucide="layers"></i>
        <p>Add your first building block</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  blocksList.innerHTML = currentOutline.blocks.map(block => renderBlock(block)).join('');
  lucide.createIcons();

  // Add event listeners to blocks
  blocksList.querySelectorAll('.block-card').forEach(card => {
    const blockId = card.dataset.blockId;
    const block = currentOutline.blocks.find(b => b.id === blockId);

    // Collapse button
    card.querySelector('.block-collapse-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBlockCollapse(blockId);
    });

    // Title input
    card.querySelector('.block-title-input').addEventListener('input', debounce((e) => {
      block.title = e.target.value;
      saveOutline();
    }, 500));

    // Edit claim button - open modal
    card.querySelector('.block-claim-edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditClaimModal(blockId, block.claim || '', block.title || 'Untitled');
    });

    // Delete block
    card.querySelector('.block-delete-btn').addEventListener('click', () => {
      deleteBlock(blockId);
    });

    // Add paper button
    card.querySelector('.block-add-paper-btn')?.addEventListener('click', () => {
      selectBlock(blockId);
      searchInput.focus();
    });

    // Remove linked paper buttons
    card.querySelectorAll('.linked-paper-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const paperKey = btn.dataset.paperKey;
        removePaperFromBlock(blockId, paperKey);
      });
    });

    // Select block on click
    card.addEventListener('click', (e) => {
      if (!e.target.closest('input') && !e.target.closest('textarea') && !e.target.closest('button')) {
        selectBlock(blockId);
      }
    });

    // Drag and drop
    card.addEventListener('dragstart', (e) => {
      draggedBlockId = blockId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      draggedBlockId = null;
      card.classList.remove('dragging');
      blocksList.querySelectorAll('.block-card').forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedBlockId && draggedBlockId !== blockId) {
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (draggedBlockId && draggedBlockId !== blockId) {
        reorderBlock(draggedBlockId, blockId);
      }
    });
  });
}

function getBlockTypeInfo(type) {
  const types = {
    'argument': { icon: 'message-square', label: 'Argument', color: 'accent' },
    'literature-category': { icon: 'folder', label: 'Category', color: 'semantic' },
    'literature': { icon: 'book-open', label: 'Literature', color: 'semantic' }
  };
  return types[type] || types['argument'];
}

function renderBlock(block) {
  const isActive = selectedBlockId === block.id;
  const blockType = block.type || 'argument';
  const typeInfo = getBlockTypeInfo(blockType);
  const isCategory = blockType === 'literature-category';
  const isCollapsed = collapsedBlocks.has(block.id);

  const linkedPapers = (block.papers || []).map(p => {
    const paper = papers.find(pp => pp.zotero_key === p.zotero_key || pp.id === p.paper_id);
    return { ...p, paper };
  }).filter(p => p.paper);

  // Category blocks: just title, no claim or papers
  if (isCategory) {
    return `
      <div class="block-card block-category ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}" data-block-id="${block.id}" data-block-type="${blockType}" draggable="true">
        <div class="block-card-header">
          <button class="block-collapse-btn" title="${isCollapsed ? 'Expand' : 'Collapse'}">
            <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}"></i>
          </button>
          <div class="block-type-badge type-${typeInfo.color}">
            <i data-lucide="${typeInfo.icon}"></i>
          </div>
          <input type="text" class="block-title-input" value="${escapeHtml(block.title || '')}" placeholder="Category name...">
          <button class="block-delete-btn" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }

  // Argument or Literature blocks: full structure
  const placeholder = blockType === 'literature'
    ? 'What does this group of papers address?'
    : 'What does this block argue or claim?';

  const paperCount = linkedPapers.length;
  const collapsedSummary = `${paperCount} paper${paperCount !== 1 ? 's' : ''}`;

  return `
    <div class="block-card block-${blockType} ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}" data-block-id="${block.id}" data-block-type="${blockType}" draggable="true">
      <div class="block-card-header">
        <button class="block-collapse-btn" title="${isCollapsed ? 'Expand' : 'Collapse'}">
          <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}"></i>
        </button>
        <div class="block-type-badge type-${typeInfo.color}">
          <i data-lucide="${typeInfo.icon}"></i>
        </div>
        <input type="text" class="block-title-input" value="${escapeHtml(block.title || '')}" placeholder="Block title...">
        ${isCollapsed ? `<span class="block-collapsed-summary">${collapsedSummary}</span>` : ''}
        <button class="block-delete-btn" title="Delete">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <div class="block-content">
        <div class="block-claim-section">
          <div class="block-claim-text">${block.claim ? renderMarkdown(block.claim) : `<span class="placeholder">${placeholder}</span>`}</div>
          <button class="block-claim-edit-btn" title="Edit description">
            <i data-lucide="pencil"></i>
          </button>
        </div>
        <div class="block-papers">
          <div class="block-papers-header">
            <span>${linkedPapers.length} paper${linkedPapers.length !== 1 ? 's' : ''} linked</span>
            <button class="block-add-paper-btn">
              <i data-lucide="plus"></i> Add paper
            </button>
          </div>
          ${linkedPapers.map(p => renderLinkedPaper(p)).join('')}
        </div>
      </div>
    </div>
  `;
}

function parseNoteWithZoteroLinks(note) {
  if (!note) return { text: '', links: [] };

  const links = [];

  // Find zotero:// links - both in markdown format and plain
  // Pattern: [text](zotero://...) or just (zotero://...) or plain zotero://...
  const zoteroLinkRegex = /\[([^\]]*)\]\((zotero:\/\/[^)]+)\)|\((zotero:\/\/[^)]+)\)|(?<![(\[])(zotero:\/\/\S+)/g;

  let match;
  while ((match = zoteroLinkRegex.exec(note)) !== null) {
    const label = match[1] || '';
    const url = match[2] || match[3] || match[4];

    if (url) {
      // Determine link type
      // Check annotation first since annotation links also contain open-pdf
      let type = 'item';
      let icon = 'external-link';

      if (url.includes('annotation=')) {
        type = 'annotation';
        icon = 'message-square';
      } else if (url.includes('open-pdf')) {
        type = 'pdf';
        icon = 'file-text';
      }

      links.push({ url, label, type, icon });
    }
  }

  // Clean the note text (remove zotero links for display)
  let cleanText = note
    .replace(/\[([^\]]*)\]\(zotero:\/\/[^)]+\)/g, '$1')  // [text](zotero://...) → text
    .replace(/\(zotero:\/\/[^)]+\)/g, '')  // (zotero://...)
    .replace(/zotero:\/\/\S+/g, '')  // plain zotero://...
    .replace(/\s+/g, ' ')
    .trim();

  return { text: cleanText, links };
}

function renderLinkedPaper(linkedPaper) {
  const { paper, note, zotero_key, paper_id } = linkedPaper;
  const key = zotero_key || paper_id;

  const { text: noteText, links: zoteroLinks } = parseNoteWithZoteroLinks(note);

  const linksHtml = zoteroLinks.length > 0 ? `
    <div class="linked-paper-links">
      ${zoteroLinks.map(link => `
        <a href="${link.url}" class="zotero-link zotero-link-${link.type}" title="${link.type === 'pdf' ? 'Open PDF' : link.type === 'annotation' ? 'Open Annotation' : 'Open in Zotero'}">
          <i data-lucide="${link.icon}"></i>
          ${link.type === 'pdf' ? 'PDF' : link.type === 'annotation' ? 'Annotation' : 'Zotero'}
        </a>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="linked-paper">
      <i class="linked-paper-icon" data-lucide="file-text"></i>
      <div class="linked-paper-content">
        <div class="linked-paper-title">${escapeHtml(paper.title || 'Untitled')}</div>
        ${noteText ? `<div class="linked-paper-note">"${escapeHtml(noteText)}"</div>` : ''}
        ${linksHtml}
      </div>
      <button class="linked-paper-remove" data-paper-key="${key}" title="Remove paper">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;
}

function renderSearchResults(results) {
  if (!results || results.length === 0) {
    searchResults.innerHTML = '<p class="empty-state">No papers found</p>';
    return;
  }

  searchResults.innerHTML = results.map(r => {
    const paper = papers.find(p => p.id === r.id) || r;
    const similarity = r.similarity ? Math.round(r.similarity * 100) : null;

    return `
      <div class="search-result" data-paper-id="${r.id}">
        <div class="search-result-content">
          <div class="search-result-title">${escapeHtml(paper.title || r.title || 'Untitled')}</div>
          <div class="search-result-meta">
            ${paper.authors || r.authors || ''} ${paper.year || r.year || ''}
            ${similarity ? `<span class="search-result-similarity">${similarity}%</span>` : ''}
          </div>
        </div>
        <button class="search-result-add" title="Add to block">
          <i data-lucide="plus"></i>
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();

  // Add event listeners
  searchResults.querySelectorAll('.search-result').forEach(el => {
    const paperId = parseInt(el.dataset.paperId);
    const paper = papers.find(p => p.id === paperId);

    el.addEventListener('click', () => {
      showPaperDetail(paper);
    });

    el.querySelector('.search-result-add').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!selectedBlockId) {
        alert('Please select a block first by clicking on it');
        return;
      }
      showAddPaperModal(paper);
    });
  });
}

function showPaperDetail(paper) {
  if (!paper) return;

  detailSection.style.display = 'block';

  // Parse notes for zotero links
  const { text: notesText, links: zoteroLinks } = parseNoteWithZoteroLinks(paper.notes || '');

  const linksHtml = zoteroLinks.length > 0 ? `
    <div class="detail-zotero-links">
      ${zoteroLinks.map(link => `
        <a href="${link.url}" class="zotero-link zotero-link-${link.type}" title="${link.type === 'pdf' ? 'Open PDF' : link.type === 'annotation' ? 'Open Annotation' : 'Open in Zotero'}">
          <i data-lucide="${link.icon}"></i>
          ${link.type === 'pdf' ? 'PDF' : link.type === 'annotation' ? 'Annotation' : 'Zotero'}
        </a>
      `).join('')}
    </div>
  ` : '';

  const notesHtml = notesText ? `
    <div class="paper-detail-section">
      <div class="paper-detail-section-title">Notes</div>
      <div class="paper-detail-notes">${escapeHtml(notesText)}</div>
      ${linksHtml}
    </div>
  ` : '';

  paperDetail.innerHTML = `
    <div class="paper-detail-title">${escapeHtml(paper.title || 'Untitled')}</div>
    <div class="paper-detail-meta">
      ${paper.authors || ''} ${paper.year ? `(${paper.year})` : ''}
    </div>
    ${paper.abstract ? `
      <div class="paper-detail-section">
        <div class="paper-detail-section-title">Abstract</div>
        <div class="paper-detail-abstract">${escapeHtml(paper.abstract)}</div>
      </div>
    ` : ''}
    ${notesHtml}
  `;

  // Re-initialize lucide icons for the new content
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ===========================================
// Block Operations
// ===========================================

function addBlock(type = 'argument') {
  if (!currentOutline) return;

  const newBlock = {
    id: generateId(),
    type: type,
    title: '',
    claim: '',
    papers: []
  };

  if (!currentOutline.blocks) {
    currentOutline.blocks = [];
  }

  currentOutline.blocks.push(newBlock);
  saveOutline();
  renderOutline();

  // Focus the new block's title
  setTimeout(() => {
    const newCard = blocksList.querySelector(`[data-block-id="${newBlock.id}"]`);
    if (newCard) {
      newCard.querySelector('.block-title-input').focus();
    }
  }, 50);
}

function deleteBlock(blockId) {
  if (!currentOutline || !confirm('Delete this block?')) return;

  currentOutline.blocks = currentOutline.blocks.filter(b => b.id !== blockId);
  if (selectedBlockId === blockId) {
    selectedBlockId = null;
  }
  saveOutline();
  renderOutline();
}

function toggleBlockCollapse(blockId) {
  if (collapsedBlocks.has(blockId)) {
    collapsedBlocks.delete(blockId);
  } else {
    collapsedBlocks.add(blockId);
  }
  renderOutline();
}

function collapseAllBlocks() {
  if (!currentOutline?.blocks) return;
  currentOutline.blocks.forEach(b => collapsedBlocks.add(b.id));
  renderOutline();
}

function expandAllBlocks() {
  collapsedBlocks.clear();
  renderOutline();
}

function reorderBlock(draggedId, targetId) {
  if (!currentOutline?.blocks || draggedId === targetId) return;

  const blocks = currentOutline.blocks;
  const draggedIdx = blocks.findIndex(b => b.id === draggedId);
  const targetIdx = blocks.findIndex(b => b.id === targetId);

  if (draggedIdx === -1 || targetIdx === -1) return;

  const [dragged] = blocks.splice(draggedIdx, 1);
  blocks.splice(targetIdx, 0, dragged);

  saveOutline();
  renderOutline();
}

function selectBlock(blockId) {
  selectedBlockId = blockId;
  renderOutline();
}

function addPaperToBlock(blockId, paper, note) {
  const block = currentOutline?.blocks?.find(b => b.id === blockId);
  if (!block) return;

  if (!block.papers) {
    block.papers = [];
  }

  // Check if already linked
  if (block.papers.some(p => p.zotero_key === paper.zotero_key || p.paper_id === paper.id)) {
    return;
  }

  block.papers.push({
    zotero_key: paper.zotero_key,
    paper_id: paper.id,
    note: note || ''
  });

  saveOutline();
  renderOutline();
}

function removePaperFromBlock(blockId, paperKey) {
  const block = currentOutline?.blocks?.find(b => b.id === blockId);
  if (!block || !block.papers) return;

  block.papers = block.papers.filter(p => p.zotero_key !== paperKey && p.paper_id !== parseInt(paperKey));
  saveOutline();
  renderOutline();
}

// ===========================================
// Outline Operations
// ===========================================

async function loadOutline(id) {
  const outline = await fetchOutline(id);
  if (outline) {
    currentOutline = outline;
    selectedBlockId = null;
    localStorage.setItem('selected_outline_id', id);
    renderOutline();
  }
}

async function saveOutline() {
  if (!currentOutline) return;

  currentOutline.title = outlineTitle.value;
  currentOutline.thesis = thesisInput.value;

  await updateOutlineAPI(currentOutline.id, {
    title: currentOutline.title,
    thesis: currentOutline.thesis,
    blocks: currentOutline.blocks
  });

  // Update select option text
  const option = outlineSelect.querySelector(`option[value="${currentOutline.id}"]`);
  if (option) {
    option.textContent = currentOutline.title || 'Untitled';
  }
}

async function createNewOutline(title) {
  const outline = await createOutlineAPI(title);
  if (outline) {
    allOutlines.push(outline);
    currentOutline = outline;
    selectedBlockId = null;
    localStorage.setItem('selected_outline_id', outline.id);
    renderOutlineSelect();
    renderOutline();
    outlineSelect.value = outline.id;
  }
}

async function deleteCurrentOutline() {
  if (!currentOutline || !confirm('Delete this outline?')) return;

  const success = await deleteOutlineAPI(currentOutline.id);
  if (success) {
    allOutlines = allOutlines.filter(o => o.id !== currentOutline.id);
    currentOutline = null;
    selectedBlockId = null;
    localStorage.removeItem('selected_outline_id');
    renderOutlineSelect();
    renderOutline();
  }
}

// ===========================================
// Search
// ===========================================

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    searchResults.innerHTML = '<p class="empty-state">Search for papers to add to your outline</p>';
    return;
  }

  searchResults.innerHTML = '<p class="empty-state">Searching...</p>';

  let results;
  if (isSemanticSearch) {
    results = await semanticSearch(query);
  } else {
    // Basic text search
    const q = query.toLowerCase();
    results = papers.filter(p => {
      const title = (p.title || '').toLowerCase();
      const authors = (p.authors || '').toLowerCase();
      const abstract = (p.abstract || '').toLowerCase();
      return title.includes(q) || authors.includes(q) || abstract.includes(q);
    }).slice(0, 20).map(p => ({ ...p }));
  }

  renderSearchResults(results);
}

// ===========================================
// Export
// ===========================================

function exportToMarkdown() {
  if (!currentOutline) return '';

  let md = `# ${currentOutline.title || 'Untitled Outline'}\n\n`;

  if (currentOutline.thesis) {
    md += `## Thesis\n\n${currentOutline.thesis}\n\n`;
  }

  if (!currentOutline.blocks || currentOutline.blocks.length === 0) {
    return md;
  }

  // Separate argument and literature blocks
  const argumentBlocks = currentOutline.blocks.filter(b => !b.type || b.type === 'argument');
  const literatureBlocks = currentOutline.blocks.filter(b => b.type === 'literature-category' || b.type === 'literature');

  // Export argument blocks
  if (argumentBlocks.length > 0) {
    md += `## Main Arguments\n\n`;

    argumentBlocks.forEach((block, i) => {
      md += `### ${i + 1}. ${block.title || 'Untitled'}\n\n`;

      if (block.claim) {
        md += `${block.claim}\n\n`;
      }

      if (block.papers && block.papers.length > 0) {
        md += `**Supporting Papers:**\n\n`;
        block.papers.forEach(p => {
          const paper = papers.find(pp => pp.zotero_key === p.zotero_key || pp.id === p.paper_id);
          if (paper) {
            md += `- ${paper.title}`;
            if (paper.authors) md += ` (${paper.authors.split(',')[0]} et al.)`;
            if (paper.year) md += `, ${paper.year}`;
            md += '\n';
            if (p.note) {
              md += `  - *${p.note}*\n`;
            }
          }
        });
        md += '\n';
      }
    });
  }

  // Export literature/related work blocks
  if (literatureBlocks.length > 0) {
    md += `## Related Work\n\n`;

    literatureBlocks.forEach(block => {
      if (block.type === 'literature-category') {
        md += `### ${block.title || 'Untitled Category'}\n\n`;
      } else if (block.type === 'literature') {
        md += `#### ${block.title || 'Untitled'}\n\n`;

        if (block.claim) {
          md += `${block.claim}\n\n`;
        }

        if (block.papers && block.papers.length > 0) {
          block.papers.forEach(p => {
            const paper = papers.find(pp => pp.zotero_key === p.zotero_key || pp.id === p.paper_id);
            if (paper) {
              md += `- ${paper.title}`;
              if (paper.authors) md += ` (${paper.authors.split(',')[0]} et al.)`;
              if (paper.year) md += `, ${paper.year}`;
              md += '\n';
              if (p.note) {
                md += `  - *${p.note}*\n`;
              }
            }
          });
          md += '\n';
        }
      }
    });
  }

  return md;
}

function showExportModal() {
  const modal = document.getElementById('exportModal');
  const content = document.getElementById('exportContent');

  content.value = exportToMarkdown();
  modal.style.display = 'flex';
}

// ===========================================
// Add Paper Modal
// ===========================================

function showAddPaperModal(paper) {
  pendingPaper = paper;

  const modal = document.getElementById('addPaperModal');
  const titleEl = document.getElementById('addPaperTitle');
  const noteInput = document.getElementById('paperNoteInput');

  titleEl.textContent = paper.title || 'Untitled';
  noteInput.value = '';
  modal.style.display = 'flex';
  noteInput.focus();
}

function confirmAddPaper() {
  if (!pendingPaper || !selectedBlockId) return;

  const noteInput = document.getElementById('paperNoteInput');
  addPaperToBlock(selectedBlockId, pendingPaper, noteInput.value);

  document.getElementById('addPaperModal').style.display = 'none';
  pendingPaper = null;
}

// ===========================================
// Utilities
// ===========================================

function generateId() {
  return 'block-' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(str) {
  if (!str) return '';

  // First escape HTML
  let html = escapeHtml(str);

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Code: `code`
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Bullet lists: lines starting with - or *
  html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> inside lists
  html = html.replace(/<\/li><br>/g, '</li>');
  html = html.replace(/<br><li>/g, '<li>');

  return html;
}

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ===========================================
// Event Listeners
// ===========================================

function initEventListeners() {
  // Outline select
  outlineSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      loadOutline(e.target.value);
    } else {
      currentOutline = null;
      selectedBlockId = null;
      renderOutline();
    }
  });

  // Outline title & thesis (auto-save)
  outlineTitle.addEventListener('input', debounce(() => saveOutline(), 500));
  thesisInput.addEventListener('input', debounce(() => saveOutline(), 500));

  // Add block dropdown
  const addBlockBtn = document.getElementById('addBlockBtn');
  const addBlockMenu = document.getElementById('addBlockMenu');

  addBlockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addBlockMenu.classList.toggle('show');
  });

  // Add block options
  document.querySelectorAll('.add-block-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.type;
      addBlock(type);
      addBlockMenu.classList.remove('show');
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    addBlockMenu.classList.remove('show');
  });

  // Import from Ideas button
  document.getElementById('importIdeasBtn')?.addEventListener('click', showImportIdeasModal);

  // Import Ideas modal close
  document.getElementById('closeImportIdeas')?.addEventListener('click', () => {
    document.getElementById('importIdeasModal').style.display = 'none';
  });

  // Edit Claim modal
  document.getElementById('closeEditClaim')?.addEventListener('click', closeEditClaimModal);
  document.getElementById('cancelEditClaim')?.addEventListener('click', closeEditClaimModal);
  document.getElementById('saveEditClaim')?.addEventListener('click', saveEditClaim);

  // Allow Ctrl+Enter to save in edit claim modal
  document.getElementById('editClaimInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveEditClaim();
    }
  });

  // New outline button
  document.getElementById('newOutlineBtn').addEventListener('click', () => {
    document.getElementById('newOutlineModal').style.display = 'flex';
    document.getElementById('newOutlineTitle').value = '';
    document.getElementById('newOutlineTitle').focus();
  });

  // New outline modal
  document.getElementById('cancelNewOutline').addEventListener('click', () => {
    document.getElementById('newOutlineModal').style.display = 'none';
  });

  document.getElementById('createNewOutline').addEventListener('click', () => {
    const title = document.getElementById('newOutlineTitle').value.trim();
    if (title) {
      createNewOutline(title);
      document.getElementById('newOutlineModal').style.display = 'none';
    }
  });

  document.getElementById('newOutlineTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const title = e.target.value.trim();
      if (title) {
        createNewOutline(title);
        document.getElementById('newOutlineModal').style.display = 'none';
      }
    }
  });

  // Delete outline button
  document.getElementById('deleteOutlineBtn').addEventListener('click', deleteCurrentOutline);

  // Export button
  document.getElementById('exportBtn').addEventListener('click', showExportModal);

  // Export modal
  document.getElementById('closeExportModal').addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'none';
  });

  document.getElementById('copyExport').addEventListener('click', () => {
    const content = document.getElementById('exportContent');
    content.select();
    document.execCommand('copy');
    const btn = document.getElementById('copyExport');
    btn.innerHTML = '<i data-lucide="check"></i> Copied!';
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy"></i> Copy to Clipboard';
      lucide.createIcons();
    }, 2000);
  });

  // Search
  document.getElementById('searchBtn').addEventListener('click', performSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Semantic toggle
  const semanticToggle = document.getElementById('semanticToggle');
  semanticToggle.classList.toggle('active', isSemanticSearch);
  semanticToggle.addEventListener('click', () => {
    isSemanticSearch = !isSemanticSearch;
    semanticToggle.classList.toggle('active', isSemanticSearch);
  });

  // Close detail panel
  document.getElementById('closeDetailBtn').addEventListener('click', () => {
    detailSection.style.display = 'none';
  });

  // Add paper modal
  document.getElementById('cancelAddPaper').addEventListener('click', () => {
    document.getElementById('addPaperModal').style.display = 'none';
    pendingPaper = null;
  });

  document.getElementById('confirmAddPaper').addEventListener('click', confirmAddPaper);

  document.getElementById('paperNoteInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      confirmAddPaper();
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
  });
}

// ===========================================
// Initialize
// ===========================================

async function initApp() {
  // Load papers first
  await loadPapers();

  // Load outlines and ideas
  await fetchOutlines();
  await fetchIdeas();
  renderOutlineSelect();

  // Load previously selected outline
  const savedOutlineId = localStorage.getItem('selected_outline_id');
  if (savedOutlineId && allOutlines.find(o => o.id === savedOutlineId)) {
    await loadOutline(savedOutlineId);
    outlineSelect.value = savedOutlineId;
  }

  // Initialize event listeners
  initEventListeners();

  // Render outline (or empty state if none selected)
  renderOutline();

  // Hide loading overlay
  document.getElementById('loadingOverlay')?.classList.add('hidden');

  console.log('Outline Builder initialized');
}
