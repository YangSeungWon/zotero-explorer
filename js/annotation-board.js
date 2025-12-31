/* ===========================================
   Annotation Board
   Trello-style card board for managing annotations
   =========================================== */

// ========== State ==========
let papers = [];
let dataMeta = {};
let boards = [];
let currentBoard = null;
let editingCardId = null;
let addingToColumnId = null;
let draggedCard = null;
let draggedColumn = null;

// ========== Initialization ==========

document.addEventListener('DOMContentLoaded', async () => {
  // Theme
  if (window.initTheme) initTheme();
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    if (window.toggleTheme) toggleTheme();
  });

  // Check auth
  if (!checkAuth()) {
    showLogin();
    return;
  }

  showLoading();
  await loadData();
  loadBoards();
  setupEventListeners();
  hideLoading();

  lucide.createIcons();
});

// ========== Data Loading ==========

async function loadData() {
  try {
    const cacheBuster = `?t=${Date.now()}`;
    const res = await fetch(`papers.json${cacheBuster}`);
    const data = await res.json();
    papers = data.papers || [];
    dataMeta = data.meta || {};
  } catch (err) {
    console.error('Failed to load papers:', err);
    papers = [];
  }
}

function loadBoards() {
  const saved = localStorage.getItem('annotationBoards');
  if (saved) {
    try {
      boards = JSON.parse(saved);
    } catch (e) {
      boards = [];
    }
  }

  updateBoardSelect();

  // Load last board or first available
  const lastBoardId = localStorage.getItem('lastBoardId');
  if (lastBoardId && boards.find(b => b.id === lastBoardId)) {
    selectBoard(lastBoardId);
  } else if (boards.length > 0) {
    selectBoard(boards[0].id);
  }
}

function saveBoards() {
  localStorage.setItem('annotationBoards', JSON.stringify(boards));
  if (currentBoard) {
    localStorage.setItem('lastBoardId', currentBoard.id);
  }
}

// ========== Board Operations ==========

function createBoard(title) {
  const board = {
    id: 'board_' + Date.now().toString(36),
    title: title || 'New Board',
    columns: [
      { id: 'col_inbox', title: '📥 Inbox', cardIds: [] }
    ],
    cards: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  boards.push(board);
  saveBoards();
  updateBoardSelect();
  selectBoard(board.id);
  return board;
}

function deleteBoard(boardId) {
  const idx = boards.findIndex(b => b.id === boardId);
  if (idx === -1) return;

  boards.splice(idx, 1);
  saveBoards();
  updateBoardSelect();

  if (currentBoard?.id === boardId) {
    currentBoard = null;
    if (boards.length > 0) {
      selectBoard(boards[0].id);
    } else {
      renderEmptyState();
    }
  }
}

function selectBoard(boardId) {
  currentBoard = boards.find(b => b.id === boardId);
  if (!currentBoard) return;

  document.getElementById('boardSelect').value = boardId;
  document.getElementById('boardTitle').value = currentBoard.title;
  localStorage.setItem('lastBoardId', boardId);

  renderBoard();
}

function updateBoardSelect() {
  const select = document.getElementById('boardSelect');
  select.innerHTML = '<option value="">Select board...</option>';
  boards.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.title;
    select.appendChild(opt);
  });
}

// ========== Column Navigation ==========

let draggedNavItem = null;

function renderColumnNav() {
  const dropdown = document.getElementById('columnNavDropdown');
  if (!dropdown || !currentBoard) {
    if (dropdown) dropdown.innerHTML = '<div class="column-nav-empty">No board selected</div>';
    return;
  }

  if (currentBoard.columns.length === 0) {
    dropdown.innerHTML = '<div class="column-nav-empty">No columns</div>';
    return;
  }

  dropdown.innerHTML = currentBoard.columns.map((col, idx) => {
    const cardCount = col.cardIds.length;
    const isInbox = col.id === 'col_inbox';
    return `
      <div class="column-nav-item ${isInbox ? 'no-drag' : ''}"
           data-column-id="${col.id}"
           data-column-idx="${idx}"
           draggable="${isInbox ? 'false' : 'true'}">
        <span class="column-nav-drag">${isInbox ? '' : '⋮⋮'}</span>
        <span class="column-nav-title">${escapeHtml(col.title)}</span>
        <span class="column-nav-count">${cardCount}</span>
      </div>
    `;
  }).join('');

  // Bind events
  dropdown.querySelectorAll('.column-nav-item').forEach(item => {
    // Click to scroll
    item.addEventListener('click', (e) => {
      if (e.target.closest('.column-nav-drag')) return; // Ignore drag handle clicks
      const columnId = item.dataset.columnId;
      scrollToColumn(columnId);
      closeColumnNav();
    });

    // Drag events (skip inbox)
    if (!item.classList.contains('no-drag')) {
      item.addEventListener('dragstart', handleNavDragStart);
      item.addEventListener('dragend', handleNavDragEnd);
      item.addEventListener('dragover', handleNavDragOver);
      item.addEventListener('drop', handleNavDrop);
    }
  });
}

function handleNavDragStart(e) {
  draggedNavItem = e.target.closest('.column-nav-item');
  draggedNavItem.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleNavDragEnd(e) {
  if (draggedNavItem) {
    draggedNavItem.classList.remove('dragging');
    draggedNavItem = null;
  }
  document.querySelectorAll('.column-nav-item').forEach(el => {
    el.classList.remove('drag-over');
  });
}

function handleNavDragOver(e) {
  e.preventDefault();
  const item = e.target.closest('.column-nav-item');
  if (!item || item === draggedNavItem || item.classList.contains('no-drag')) return;

  // Remove previous indicators
  document.querySelectorAll('.column-nav-item').forEach(el => {
    el.classList.remove('drag-over');
  });
  item.classList.add('drag-over');
}

function handleNavDrop(e) {
  e.preventDefault();
  const targetItem = e.target.closest('.column-nav-item');
  if (!targetItem || !draggedNavItem || targetItem === draggedNavItem) return;
  if (targetItem.classList.contains('no-drag')) return;

  const fromIdx = parseInt(draggedNavItem.dataset.columnIdx);
  const toIdx = parseInt(targetItem.dataset.columnIdx);

  // Reorder columns
  reorderColumn(fromIdx, toIdx);
}

function reorderColumn(fromIdx, toIdx) {
  if (!currentBoard || fromIdx === toIdx) return;

  // Don't move inbox (index 0)
  if (fromIdx === 0 || toIdx === 0) return;

  const columns = currentBoard.columns;
  const [removed] = columns.splice(fromIdx, 1);
  columns.splice(toIdx, 0, removed);

  currentBoard.updatedAt = Date.now();
  saveBoards();
  renderColumnNav();
  renderBoard();
}

function scrollToColumn(columnId) {
  const columnEl = document.querySelector(`.board-column[data-column-id="${columnId}"]`);
  if (columnEl) {
    columnEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    // Highlight briefly
    columnEl.classList.add('highlight');
    setTimeout(() => columnEl.classList.remove('highlight'), 1000);
  }
}

function toggleColumnNav() {
  const dropdown = document.getElementById('columnNavDropdown');
  const isOpen = dropdown.classList.toggle('open');
  if (isOpen) {
    renderColumnNav();
  }
}

function closeColumnNav() {
  document.getElementById('columnNavDropdown')?.classList.remove('open');
}

function setupColumnNav() {
  const btn = document.getElementById('columnNavBtn');
  const dropdown = document.getElementById('columnNavDropdown');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleColumnNav();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.column-nav-wrapper')) {
      closeColumnNav();
    }
  });
}

// ========== Column Operations ==========

function addColumn(title = 'New Column') {
  if (!currentBoard) return;

  const column = {
    id: 'col_' + Date.now().toString(36),
    title: title,
    cardIds: []
  };

  currentBoard.columns.push(column);
  currentBoard.updatedAt = Date.now();
  saveBoards();
  renderBoard();
}

function deleteColumn(columnId) {
  if (!currentBoard) return;

  const colIdx = currentBoard.columns.findIndex(c => c.id === columnId);
  if (colIdx === -1) return;

  const column = currentBoard.columns[colIdx];

  // Move cards to Inbox or delete them
  const inboxCol = currentBoard.columns.find(c => c.id === 'col_inbox');
  if (inboxCol && columnId !== 'col_inbox') {
    inboxCol.cardIds.push(...column.cardIds);
  } else {
    // Delete cards
    column.cardIds.forEach(cardId => {
      delete currentBoard.cards[cardId];
    });
  }

  currentBoard.columns.splice(colIdx, 1);
  currentBoard.updatedAt = Date.now();
  saveBoards();
  renderBoard();
}

function renameColumn(columnId, newTitle) {
  if (!currentBoard) return;

  const column = currentBoard.columns.find(c => c.id === columnId);
  if (column) {
    column.title = newTitle;
    currentBoard.updatedAt = Date.now();
    saveBoards();
  }
}

// ========== Card Operations ==========

function addCard(columnId, annotationData) {
  if (!currentBoard) return null;

  const card = {
    id: annotationData.id || generateAnnotationId(),
    quote: annotationData.quote || '',
    source: annotationData.source || { text: '', zoteroKey: null, zoteroUrl: null },
    pdf: annotationData.pdf || null,
    myNote: annotationData.myNote || '',
    paperId: annotationData.paperId || null,
    paperTitle: annotationData.paperTitle || null,
    createdAt: annotationData.createdAt || Date.now()
  };

  currentBoard.cards[card.id] = card;

  const column = currentBoard.columns.find(c => c.id === columnId);
  if (column) {
    column.cardIds.push(card.id);
  }

  currentBoard.updatedAt = Date.now();
  saveBoards();
  return card;
}

function updateCard(cardId, updates) {
  if (!currentBoard || !currentBoard.cards[cardId]) return;

  Object.assign(currentBoard.cards[cardId], updates);
  currentBoard.updatedAt = Date.now();
  saveBoards();
  renderBoard();
}

function deleteCard(cardId) {
  if (!currentBoard) return;

  // Remove from column
  currentBoard.columns.forEach(col => {
    const idx = col.cardIds.indexOf(cardId);
    if (idx !== -1) col.cardIds.splice(idx, 1);
  });

  // Delete card
  delete currentBoard.cards[cardId];
  currentBoard.updatedAt = Date.now();
  saveBoards();
  renderBoard();
}

function moveCard(cardId, fromColumnId, toColumnId, newIndex) {
  if (!currentBoard) return;

  const fromCol = currentBoard.columns.find(c => c.id === fromColumnId);
  const toCol = currentBoard.columns.find(c => c.id === toColumnId);

  if (!fromCol || !toCol) return;

  // Remove from source
  const oldIdx = fromCol.cardIds.indexOf(cardId);
  if (oldIdx !== -1) fromCol.cardIds.splice(oldIdx, 1);

  // Add to target
  if (newIndex !== undefined && newIndex >= 0) {
    toCol.cardIds.splice(newIndex, 0, cardId);
  } else {
    toCol.cardIds.push(cardId);
  }

  currentBoard.updatedAt = Date.now();
  saveBoards();
}

// ========== Rendering ==========

function renderBoard() {
  if (!currentBoard) {
    renderEmptyState();
    return;
  }

  const container = document.getElementById('columnsContainer');
  container.innerHTML = '';

  currentBoard.columns.forEach(column => {
    container.appendChild(renderColumn(column));
  });

  lucide.createIcons();
  setupDragAndDrop();
}

function renderEmptyState() {
  const container = document.getElementById('columnsContainer');
  container.innerHTML = `
    <div class="empty-state">
      <i data-lucide="layout-dashboard"></i>
      <h3>No Board Selected</h3>
      <p>Create a new board or select an existing one</p>
      <button class="btn-primary" onclick="document.getElementById('newBoardBtn').click()">
        <i data-lucide="plus"></i> Create Board
      </button>
    </div>
  `;
  lucide.createIcons();
}

function renderColumn(column) {
  const div = document.createElement('div');
  div.className = 'board-column';
  div.dataset.columnId = column.id;

  const isInbox = column.id === 'col_inbox';

  div.innerHTML = `
    <div class="column-header" draggable="${isInbox ? 'false' : 'true'}">
      <input type="text" class="column-title-input" value="${escapeHtml(column.title)}"
             ${isInbox ? 'readonly' : ''}>
      ${!isInbox ? `
        <button class="column-delete-btn" title="Delete column">
          <i data-lucide="x"></i>
        </button>
      ` : ''}
    </div>
    <div class="column-cards" data-column-id="${column.id}">
      ${column.cardIds.map(cardId => {
        const card = currentBoard.cards[cardId];
        return card ? renderCard(card) : '';
      }).join('')}
    </div>
    <button class="add-card-btn" data-column-id="${column.id}">
      <i data-lucide="plus"></i> Add Card
    </button>
  `;

  // Column title change
  const titleInput = div.querySelector('.column-title-input');
  if (!isInbox) {
    titleInput.addEventListener('blur', () => {
      renameColumn(column.id, titleInput.value);
    });
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') titleInput.blur();
    });
  }

  // Delete column
  const deleteBtn = div.querySelector('.column-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm('Delete this column? Cards will be moved to Inbox.')) {
        deleteColumn(column.id);
      }
    });
  }

  // Add card button
  const addBtn = div.querySelector('.add-card-btn');
  addBtn.addEventListener('click', () => {
    openAddCardModal(column.id);
  });

  return div;
}

function renderCard(card) {
  const quotePreview = card.quote.length > 100
    ? card.quote.substring(0, 100) + '...'
    : card.quote;

  const sourceText = card.source?.text || '';
  const zoteroKey = card.source?.zoteroKey;
  const hasZotero = !!card.source?.zoteroUrl;
  const hasPdf = !!card.pdf?.url;

  // Find paper title from papers array
  let paperTitle = card.paperTitle || '';
  if (!paperTitle && zoteroKey) {
    const paper = papers.find(p => p.zotero_key === zoteroKey);
    if (paper) paperTitle = paper.title;
  }

  // Explorer link
  const explorerLink = zoteroKey ? `https://z.ysw.kr/?paper=${zoteroKey}` : null;

  return `
    <div class="annotation-card" draggable="true" data-card-id="${card.id}">
      <div class="card-quote">${escapeHtml(quotePreview)}</div>
      <div class="card-source">
        ${escapeHtml(sourceText)}
        ${paperTitle ? `<div class="card-paper-title">${escapeHtml(paperTitle)}</div>` : ''}
      </div>
      <div class="card-links">
        ${explorerLink ? `<a href="${explorerLink}" target="_blank" class="card-link" title="Open in Explorer"><i data-lucide="compass"></i></a>` : ''}
        ${hasZotero ? `<a href="${card.source.zoteroUrl}" class="card-link" title="Open in Zotero"><i data-lucide="book-open"></i></a>` : ''}
        ${hasPdf ? `<a href="${card.pdf.url}" class="card-link" title="Open PDF${card.pdf.page ? ' (p.' + card.pdf.page + ')' : ''}"><i data-lucide="file-text"></i></a>` : ''}
      </div>
      ${card.myNote ? `<div class="card-note">${escapeHtml(card.myNote)}</div>` : ''}
      <div class="card-actions">
        <button class="card-edit-btn" title="Edit"><i data-lucide="pencil"></i></button>
        <button class="card-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
  `;
}

// ========== Drag and Drop ==========

function setupDragAndDrop() {
  // Card drag
  document.querySelectorAll('.annotation-card').forEach(card => {
    card.addEventListener('dragstart', handleCardDragStart);
    card.addEventListener('dragend', handleCardDragEnd);
  });

  // Column drop zones
  document.querySelectorAll('.column-cards').forEach(zone => {
    zone.addEventListener('dragover', handleCardDragOver);
    zone.addEventListener('drop', handleCardDrop);
    zone.addEventListener('dragleave', handleCardDragLeave);
  });

  // Card actions
  document.querySelectorAll('.card-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cardEl = btn.closest('.annotation-card');
      openEditCardModal(cardEl.dataset.cardId);
    });
  });

  document.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cardEl = btn.closest('.annotation-card');
      if (confirm('Delete this annotation?')) {
        deleteCard(cardEl.dataset.cardId);
      }
    });
  });

  // Card click to show paper detail
  document.querySelectorAll('.annotation-card').forEach(cardEl => {
    cardEl.addEventListener('click', (e) => {
      // Ignore if clicking on buttons or links
      if (e.target.closest('button') || e.target.closest('a')) return;

      const cardId = cardEl.dataset.cardId;
      const card = currentBoard?.cards[cardId];
      if (!card) return;

      // Find paper by zotero_key or paperId
      const zoteroKey = card.source?.zoteroKey;
      let paper = null;

      if (zoteroKey) {
        paper = papers.find(p => p.zotero_key === zoteroKey);
      }
      if (!paper && card.paperId) {
        paper = papers.find(p => p.id === card.paperId);
      }

      if (paper) {
        // Remove previous selection
        document.querySelectorAll('.annotation-card.selected').forEach(el => {
          el.classList.remove('selected');
        });
        // Mark this card as selected
        cardEl.classList.add('selected');

        showPaperDetail(paper.id);
        openDetailPanel();
      }
    });
  });
}

function handleCardDragStart(e) {
  draggedCard = e.target;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
}

function handleCardDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedCard = null;
  document.querySelectorAll('.column-cards').forEach(zone => {
    zone.classList.remove('drag-over');
  });
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
}

function handleCardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const zone = e.currentTarget;
  zone.classList.add('drag-over');

  // Find insert position
  const afterElement = getDragAfterElement(zone, e.clientY);

  // Show drop indicator
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';

  if (afterElement) {
    zone.insertBefore(indicator, afterElement);
  } else {
    zone.appendChild(indicator);
  }
}

function handleCardDragLeave(e) {
  // Only remove if leaving the zone entirely
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  }
}

function handleCardDrop(e) {
  e.preventDefault();

  const cardId = e.dataTransfer.getData('text/plain');
  const toColumnId = e.currentTarget.dataset.columnId;

  if (!cardId || !toColumnId) return;

  // Find source column
  let fromColumnId = null;
  currentBoard.columns.forEach(col => {
    if (col.cardIds.includes(cardId)) {
      fromColumnId = col.id;
    }
  });

  if (!fromColumnId) return;

  // Calculate new index
  const afterElement = getDragAfterElement(e.currentTarget, e.clientY);
  let newIndex;

  if (afterElement) {
    const afterCardId = afterElement.dataset.cardId;
    const toCol = currentBoard.columns.find(c => c.id === toColumnId);
    newIndex = toCol.cardIds.indexOf(afterCardId);
    if (newIndex === -1) newIndex = toCol.cardIds.length;
  } else {
    newIndex = currentBoard.columns.find(c => c.id === toColumnId).cardIds.length;
  }

  // Adjust if moving within same column
  if (fromColumnId === toColumnId) {
    const fromCol = currentBoard.columns.find(c => c.id === fromColumnId);
    const oldIndex = fromCol.cardIds.indexOf(cardId);
    if (oldIndex < newIndex) newIndex--;
  }

  moveCard(cardId, fromColumnId, toColumnId, newIndex);
  renderBoard();
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.annotation-card:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ========== Modals ==========

function openEditCardModal(cardId) {
  if (!currentBoard || !currentBoard.cards[cardId]) return;

  editingCardId = cardId;
  const card = currentBoard.cards[cardId];

  document.getElementById('editCardQuote').value = card.quote || '';
  document.getElementById('editCardSource').value = card.source?.text || '';
  document.getElementById('editCardNote').value = card.myNote || '';

  document.getElementById('editCardModal').style.display = 'flex';
}

function closeEditCardModal() {
  editingCardId = null;
  document.getElementById('editCardModal').style.display = 'none';
}

function saveEditCard() {
  if (!editingCardId) return;

  updateCard(editingCardId, {
    quote: document.getElementById('editCardQuote').value.trim(),
    source: {
      ...currentBoard.cards[editingCardId].source,
      text: document.getElementById('editCardSource').value.trim()
    },
    myNote: document.getElementById('editCardNote').value.trim()
  });

  closeEditCardModal();
}

let parsedAddCardData = null;

function openAddCardModal(columnId) {
  addingToColumnId = columnId;
  parsedAddCardData = null;

  document.getElementById('addCardRaw').value = '';
  document.getElementById('addCardPreview').innerHTML = '';
  document.getElementById('addCardPreview').classList.remove('has-content');

  document.getElementById('addCardModal').style.display = 'flex';
  document.getElementById('addCardRaw').focus();
}

function closeAddCardModal() {
  addingToColumnId = null;
  parsedAddCardData = null;
  document.getElementById('addCardModal').style.display = 'none';
}

function updateAddCardPreview() {
  const rawText = document.getElementById('addCardRaw').value.trim();
  const preview = document.getElementById('addCardPreview');

  if (!rawText) {
    preview.classList.remove('has-content');
    preview.innerHTML = '';
    parsedAddCardData = null;
    return;
  }

  // Parse the raw text
  const parsed = parseRawAnnotation(rawText);
  parsedAddCardData = parsed;

  if (parsed.quote) {
    preview.classList.add('has-content');
    preview.innerHTML = `
      <div class="preview-label">Preview</div>
      <div class="preview-quote">${escapeHtml(parsed.quote)}</div>
      ${parsed.source?.text ? `<div class="preview-source">${escapeHtml(parsed.source.text)}</div>` : ''}
      <div class="preview-links">
        ${parsed.source?.zoteroUrl ? '<span class="preview-link">Zotero</span>' : ''}
        ${parsed.pdf?.url ? `<span class="preview-link">PDF${parsed.pdf.page ? ' p.' + parsed.pdf.page : ''}</span>` : ''}
      </div>
      ${parsed.myNote ? `<div class="preview-note">${escapeHtml(parsed.myNote)}</div>` : ''}
    `;
  } else {
    preview.classList.remove('has-content');
    preview.innerHTML = '';
  }
}

function confirmAddCard() {
  if (!addingToColumnId) return;

  const rawText = document.getElementById('addCardRaw').value.trim();
  if (!rawText) {
    alert('Please paste an annotation');
    return;
  }

  // Use parsed data or parse again
  const data = parsedAddCardData || parseRawAnnotation(rawText);

  if (!data.quote) {
    alert('Could not parse annotation. Make sure it contains a quoted text.');
    return;
  }

  addCard(addingToColumnId, data);

  closeAddCardModal();
  renderBoard();
}

function openNewBoardModal() {
  document.getElementById('newBoardTitle').value = '';
  document.getElementById('newBoardModal').style.display = 'flex';
  document.getElementById('newBoardTitle').focus();
}

function closeNewBoardModal() {
  document.getElementById('newBoardModal').style.display = 'none';
}

// ========== Import Annotations ==========

function openImportModal() {
  if (!currentBoard) {
    alert('Please create or select a board first');
    return;
  }

  renderImportPapersList();
  document.getElementById('importModal').style.display = 'flex';
}

function closeImportModal() {
  document.getElementById('importModal').style.display = 'none';
}

function renderImportPapersList(filter = '') {
  const container = document.getElementById('importPapersList');

  // Get papers with annotations
  const papersWithAnnotations = papers.filter(p => hasAnnotations(p));

  // Filter by search
  const filtered = filter
    ? papersWithAnnotations.filter(p =>
        p.title?.toLowerCase().includes(filter.toLowerCase()) ||
        p.authors?.toLowerCase().includes(filter.toLowerCase())
      )
    : papersWithAnnotations;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="import-empty">
        ${filter ? 'No matching papers found' : 'No papers with annotations found'}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(paper => {
    const annotationCount = countAnnotations(paper);
    return `
      <div class="import-paper-item" data-paper-id="${paper.id}">
        <input type="checkbox" class="import-checkbox" data-paper-id="${paper.id}">
        <div class="import-paper-info">
          <div class="import-paper-title">${escapeHtml(paper.title)}</div>
          <div class="import-paper-meta">
            ${escapeHtml(abbreviateAuthors(paper.authors))} · ${paper.year || '?'} ·
            <span class="annotation-count">${annotationCount} annotations</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function importSelectedAnnotations() {
  if (!currentBoard) return;

  const checkboxes = document.querySelectorAll('.import-checkbox:checked');
  const paperIds = [...checkboxes].map(cb => cb.dataset.paperId);

  if (paperIds.length === 0) {
    alert('Please select at least one paper');
    return;
  }

  let importedCount = 0;
  const inboxCol = currentBoard.columns.find(c => c.id === 'col_inbox');

  paperIds.forEach(paperId => {
    const paper = papers.find(p => p.id === paperId);
    if (!paper) return;

    const noteText = paper.notes_html || paper.notes;
    const annotations = parseAnnotationsFromNote(noteText, paper);

    annotations.forEach(ann => {
      // Check if already imported (by quote match)
      const exists = Object.values(currentBoard.cards).some(
        c => c.quote === ann.quote && c.paperId === ann.paperId
      );

      if (!exists) {
        addCard('col_inbox', ann);
        importedCount++;
      }
    });
  });

  closeImportModal();
  renderBoard();

  if (importedCount > 0) {
    alert(`Imported ${importedCount} annotations to Inbox`);
  } else {
    alert('No new annotations to import (duplicates skipped)');
  }
}

// ========== Export ==========

function exportBoard() {
  if (!currentBoard) return;

  let markdown = `# ${currentBoard.title}\n\n`;
  markdown += `_Exported: ${new Date().toLocaleString()}_\n\n---\n\n`;

  currentBoard.columns.forEach(column => {
    if (column.cardIds.length === 0) return;

    markdown += `## ${column.title}\n\n`;

    column.cardIds.forEach(cardId => {
      const card = currentBoard.cards[cardId];
      if (!card) return;

      markdown += `> "${card.quote}"\n`;
      if (card.source?.text) {
        markdown += `> — ${card.source.text}`;
        if (card.source.zoteroUrl) {
          markdown += ` [Zotero](${card.source.zoteroUrl})`;
        }
        markdown += '\n';
      }
      if (card.pdf?.url) {
        markdown += `> [PDF${card.pdf.page ? ' p.' + card.pdf.page : ''}](${card.pdf.url})\n`;
      }
      markdown += '\n';

      if (card.myNote) {
        markdown += `${card.myNote}\n\n`;
      }

      markdown += '---\n\n';
    });
  });

  document.getElementById('exportContent').value = markdown;
  document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() {
  document.getElementById('exportModal').style.display = 'none';
}

function copyExport() {
  const content = document.getElementById('exportContent');
  content.select();
  document.execCommand('copy');

  const btn = document.getElementById('copyExport');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="check"></i> Copied!';
  lucide.createIcons();
  setTimeout(() => {
    btn.innerHTML = originalText;
    lucide.createIcons();
  }, 2000);
}

// ========== Migrate from Outlines ==========

let outlinesList = [];

async function fetchOutlines() {
  try {
    const response = await fetch('/api/outlines', {
      headers: { 'X-API-Key': getApiKey() }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.outlines || data || [];
  } catch (e) {
    console.error('Failed to fetch outlines:', e);
    return [];
  }
}

async function openMigrateModal() {
  const container = document.getElementById('migrateOutlinesList');
  container.innerHTML = '<div class="import-empty">Loading outlines...</div>';
  document.getElementById('migrateModal').style.display = 'flex';

  outlinesList = await fetchOutlines();

  if (outlinesList.length === 0) {
    container.innerHTML = '<div class="import-empty">No outlines found</div>';
    return;
  }

  container.innerHTML = outlinesList.map(outline => {
    const blockCount = outline.blocks?.length || 0;
    const paperCount = outline.blocks?.reduce((sum, b) => sum + (b.papers?.length || 0), 0) || 0;
    return `
      <div class="import-paper-item" data-outline-id="${outline.id}">
        <input type="checkbox" class="import-checkbox migrate-checkbox" data-outline-id="${outline.id}">
        <div class="import-paper-info">
          <div class="import-paper-title">${escapeHtml(outline.title || 'Untitled')}</div>
          <div class="import-paper-meta">
            ${blockCount} blocks · ${paperCount} papers
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function closeMigrateModal() {
  document.getElementById('migrateModal').style.display = 'none';
}

async function migrateSelectedOutlines() {
  const checkboxes = document.querySelectorAll('.migrate-checkbox:checked');
  const outlineIds = [...checkboxes].map(cb => cb.dataset.outlineId);

  if (outlineIds.length === 0) {
    alert('Please select at least one outline');
    return;
  }

  let totalCards = 0;

  for (const outlineId of outlineIds) {
    const outline = outlinesList.find(o => o.id === outlineId);
    if (!outline) continue;

    // Create a new board for this outline
    const board = {
      id: 'board_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      title: outline.title || 'Migrated Outline',
      columns: [{ id: 'col_inbox', title: '📥 Inbox', cardIds: [] }],
      cards: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Create columns from blocks
    const blockColumns = {};
    for (const block of (outline.blocks || [])) {
      const colId = 'col_' + block.id;
      const colTitle = block.claim || block.heading || block.type || 'Untitled';

      board.columns.push({
        id: colId,
        title: colTitle,
        cardIds: []
      });
      blockColumns[block.id] = colId;

      // Convert linked papers with notes to cards
      for (const linkedPaper of (block.papers || [])) {
        if (!linkedPaper.note) continue;

        // Parse single annotation from the note
        const parsed = parseRawAnnotation(linkedPaper.note);

        if (parsed.quote) {
          const cardId = generateAnnotationId();
          board.cards[cardId] = {
            id: cardId,
            quote: parsed.quote,
            source: parsed.source || { text: '', zoteroKey: linkedPaper.zotero_key },
            pdf: parsed.pdf || null,
            myNote: parsed.myNote || '',
            paperId: linkedPaper.paper_id,
            createdAt: Date.now()
          };
          board.columns.find(c => c.id === colId).cardIds.push(cardId);
          totalCards++;
        }
      }
    }

    // Remove empty columns (except Inbox)
    board.columns = board.columns.filter(col =>
      col.id === 'col_inbox' || col.cardIds.length > 0
    );

    boards.push(board);
  }

  saveBoards();
  updateBoardSelect();
  closeMigrateModal();

  if (totalCards > 0) {
    alert(`Migrated ${outlineIds.length} outline(s) with ${totalCards} cards`);
    // Select the first migrated board
    const firstMigratedId = boards[boards.length - outlineIds.length]?.id;
    if (firstMigratedId) selectBoard(firstMigratedId);
  } else {
    alert('No annotations found in selected outlines');
  }
}

// ========== Event Listeners ==========

function setupEventListeners() {
  // Board select
  document.getElementById('boardSelect').addEventListener('change', (e) => {
    if (e.target.value) selectBoard(e.target.value);
  });

  // Board title
  document.getElementById('boardTitle').addEventListener('blur', (e) => {
    if (currentBoard) {
      currentBoard.title = e.target.value.trim() || 'Untitled Board';
      currentBoard.updatedAt = Date.now();
      saveBoards();
      updateBoardSelect();
    }
  });

  // New board
  document.getElementById('newBoardBtn').addEventListener('click', openNewBoardModal);
  document.getElementById('cancelNewBoard').addEventListener('click', closeNewBoardModal);
  document.getElementById('createNewBoard').addEventListener('click', () => {
    const title = document.getElementById('newBoardTitle').value.trim();
    createBoard(title || 'New Board');
    closeNewBoardModal();
  });

  // Delete board
  document.getElementById('deleteBoardBtn').addEventListener('click', () => {
    if (!currentBoard) return;
    if (confirm(`Delete board "${currentBoard.title}"? This cannot be undone.`)) {
      deleteBoard(currentBoard.id);
    }
  });

  // Add column
  document.getElementById('addColumnBtn').addEventListener('click', () => {
    const title = prompt('Column title:', 'New Column');
    if (title) addColumn(title);
  });
  document.getElementById('addColumnPlaceholder').addEventListener('click', () => {
    const title = prompt('Column title:', 'New Column');
    if (title) addColumn(title);
  });

  // Import
  document.getElementById('importAnnotationsBtn').addEventListener('click', openImportModal);
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('cancelImport').addEventListener('click', closeImportModal);
  document.getElementById('confirmImport').addEventListener('click', importSelectedAnnotations);
  document.getElementById('importSearchInput').addEventListener('input', (e) => {
    renderImportPapersList(e.target.value);
  });

  // Edit card modal
  document.getElementById('closeEditCard').addEventListener('click', closeEditCardModal);
  document.getElementById('cancelEditCard').addEventListener('click', closeEditCardModal);
  document.getElementById('saveEditCard').addEventListener('click', saveEditCard);

  // Add card modal
  document.getElementById('closeAddCard').addEventListener('click', closeAddCardModal);
  document.getElementById('cancelAddCard').addEventListener('click', closeAddCardModal);
  document.getElementById('confirmAddCard').addEventListener('click', confirmAddCard);
  document.getElementById('addCardRaw').addEventListener('input', updateAddCardPreview);
  document.getElementById('addCardRaw').addEventListener('paste', () => {
    // Delay to get pasted content
    setTimeout(updateAddCardPreview, 0);
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', exportBoard);
  document.getElementById('closeExportModal').addEventListener('click', closeExportModal);
  document.getElementById('copyExport').addEventListener('click', copyExport);

  // Migrate from Outlines
  document.getElementById('migrateOutlinesBtn').addEventListener('click', openMigrateModal);
  document.getElementById('closeMigrateModal').addEventListener('click', closeMigrateModal);
  document.getElementById('cancelMigrate').addEventListener('click', closeMigrateModal);
  document.getElementById('confirmMigrate').addEventListener('click', migrateSelectedOutlines);

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
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
  });

  // Setup detail panel
  initPaperDetailPanel();

  // Setup column navigation
  setupColumnNav();
}

// ========== Auth Helpers ==========

function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('loginApiKey').value;
    if (await validateApiKey(key)) {
      setApiKey(key);
      document.getElementById('loginOverlay').style.display = 'none';
      showLoading();
      await loadData();
      loadBoards();
      setupEventListeners();
      hideLoading();
      lucide.createIcons();
    } else {
      document.getElementById('loginError').textContent = 'Invalid API key';
    }
  });
}

function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

// ========== Paper Detail Panel (using shared component) ==========

let paperSearch = null;
let paperDetailPanel = null;

function initPaperDetailPanel() {
  // Create detail panel instance
  paperDetailPanel = createPaperDetailPanel({
    panelEl: document.getElementById('boardDetailPanel'),
    titleEl: document.getElementById('boardDetailTitle'),
    metaEl: document.getElementById('boardDetailMeta'),
    linksEl: document.getElementById('boardDetailLinks'),
    abstractEl: document.getElementById('boardDetailAbstract'),
    notesEl: document.getElementById('boardDetailNotes'),
    getPapers: () => papers,
    getMeta: () => dataMeta
  });

  // Create search instance with semantic search toggle
  paperSearch = createPaperSearch({
    inputEl: document.getElementById('boardSearchInput'),
    resultsEl: document.getElementById('boardSearchResults'),
    toggleEl: document.getElementById('boardSemanticToggle'),
    getPapers: () => papers,
    onSelect: (paper) => {
      paperDetailPanel.show(paper);
    },
    onDetail: (paper) => {
      paperDetailPanel.show(paper);
    },
    options: {
      semanticSearchFn: (query) => semanticSearchApi(query, 15),
      maxResults: 15
    }
  });

  // Toggle button
  document.getElementById('boardDetailToggle')?.addEventListener('click', () => {
    const isOpen = paperDetailPanel.toggle();
    if (isOpen) {
      document.getElementById('boardSearchInput').focus();
    }
  });

  // Close button
  document.getElementById('closeBoardDetail')?.addEventListener('click', () => {
    paperDetailPanel.close();
  });
}

function openDetailPanel() {
  paperDetailPanel?.open();
  document.getElementById('boardSearchInput')?.focus();
}

function closeDetailPanel() {
  paperDetailPanel?.close();
}

function showPaperDetail(paperId) {
  paperDetailPanel?.show(paperId);
}
