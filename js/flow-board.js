/* ===========================================
   Flow Board
   Free-canvas argument flow builder
   =========================================== */

// ========== State ==========
let papers = [];
let dataMeta = {};
let allBoards = [];
let currentBoard = null;
let selectedBlockId = null;
let editingBlockId = null;
let editingPaperId = null;
let editingPaperTitle = null;
let selectedEdgeId = null;
let drawingEdge = null;      // { fromBlockId, tempLine }
let isDraggingBlock = null;  // { blockId, element, offsetX, offsetY }
let viewport = { x: 0, y: 0, zoom: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panStartViewport = { x: 0, y: 0 };
let saveTimeout = null;
const SAVE_DELAY = 1500;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 1.5;
const BLOCK_WIDTH = 460;

// ========== Initialization ==========

async function initApp() {
  if (window.initTheme) initTheme();
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    if (window.toggleTheme) toggleTheme();
  });

  showLoading();
  await loadData();
  await fetchBoards();
  migrateFromLocalStorage();
  setupEventListeners();
  initPanZoom();
  initPaperDetailPanel();
  hideLoading();

  const lastId = localStorage.getItem('lastBoardId');
  if (lastId && allBoards.find(b => b.id === lastId)) {
    await selectBoard(lastId);
  } else if (allBoards.length > 0) {
    await selectBoard(allBoards[0].id);
  } else {
    renderEmptyState();
  }

  lucide.createIcons();
}

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

function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

// ========== Board API ==========

async function fetchBoards() {
  try {
    const data = await apiCall('/boards');
    allBoards = data.boards || [];
    updateBoardSelect();
  } catch (err) {
    console.error('Failed to fetch boards:', err);
    allBoards = [];
  }
}

async function fetchBoard(id) {
  try {
    const data = await apiCall(`/boards/${id}`);
    return data.board;
  } catch (err) {
    console.error('Failed to fetch board:', err);
    return null;
  }
}

async function createBoardAPI(title) {
  try {
    const data = await apiCall('/boards', {
      method: 'POST',
      body: JSON.stringify({ title: title || 'Untitled' })
    });
    return data.board;
  } catch (err) {
    console.error('Failed to create board:', err);
    return null;
  }
}

async function updateBoardAPI(id, updates) {
  try {
    const data = await apiCall(`/boards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return data.board;
  } catch (err) {
    console.error('Failed to update board:', err);
    return null;
  }
}

async function deleteBoardAPI(id) {
  try {
    await apiCall(`/boards/${id}`, { method: 'DELETE' });
    return true;
  } catch (err) {
    console.error('Failed to delete board:', err);
    return false;
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!currentBoard) return;
    updateBoardAPI(currentBoard.id, {
      title: currentBoard.title,
      blocks: currentBoard.blocks,
      edges: currentBoard.edges,
      viewport: viewport
    });
  }, SAVE_DELAY);
}

// ========== Board Operations ==========

function updateBoardSelect() {
  const select = document.getElementById('boardSelect');
  const currentVal = select.value;
  select.innerHTML = '<option value="">Select board...</option>';
  allBoards.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.title || 'Untitled';
    select.appendChild(opt);
  });
  if (currentVal) select.value = currentVal;
}

async function selectBoard(id) {
  const board = await fetchBoard(id);
  if (!board) return;

  currentBoard = board;
  // Normalize blocks to object
  if (Array.isArray(currentBoard.blocks)) {
    const obj = {};
    currentBoard.blocks.forEach(b => { obj[b.id] = b; });
    currentBoard.blocks = obj;
  }
  if (!currentBoard.edges) currentBoard.edges = [];
  if (!currentBoard.blocks) currentBoard.blocks = {};

  document.getElementById('boardSelect').value = id;
  document.getElementById('boardTitle').value = currentBoard.title || '';
  localStorage.setItem('lastBoardId', id);

  // Restore viewport
  if (currentBoard.viewport) {
    viewport = { ...currentBoard.viewport };
  } else {
    viewport = { x: 0, y: 0, zoom: 1 };
  }

  renderBoard();
}

function renderBoard() {
  const blockLayer = document.getElementById('blockLayer');
  const svgLayer = document.getElementById('svgLayer');

  if (!currentBoard) {
    renderEmptyState();
    return;
  }

  // Clear
  blockLayer.innerHTML = '';
  clearSvgEdges();

  const blocks = currentBoard.blocks || {};
  if (Object.keys(blocks).length === 0 && currentBoard.edges.length === 0) {
    blockLayer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="layout-dashboard"></i>
        <h3>Empty Board</h3>
        <p>Add blocks or import annotations to get started</p>
      </div>
    `;
    lucide.createIcons();
  }

  // Render blocks
  Object.values(blocks).forEach(block => {
    const el = createBlockElement(block);
    blockLayer.appendChild(el);
  });

  // Render edges
  renderAllEdges();
  applyViewportTransform();
  lucide.createIcons();
}

function renderEmptyState() {
  const blockLayer = document.getElementById('blockLayer');
  blockLayer.innerHTML = `
    <div class="empty-state">
      <i data-lucide="layout-dashboard"></i>
      <h3>No Board Selected</h3>
      <p>Create a new board or select an existing one</p>
    </div>
  `;
  clearSvgEdges();
  lucide.createIcons();
}

// ========== Canvas Pan/Zoom ==========

function initPanZoom() {
  const container = document.getElementById('canvasContainer');

  // Pan
  container.addEventListener('mousedown', (e) => {
    // Only pan on empty area (not on blocks)
    if (e.target.closest('.flow-block') || e.target.closest('.connector') || e.target.closest('.zoom-controls')) return;

    // Deselect
    deselectAll();

    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panStartViewport = { x: viewport.x, y: viewport.y };
    container.classList.add('panning');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      viewport.x = panStartViewport.x + (e.clientX - panStart.x);
      viewport.y = panStartViewport.y + (e.clientY - panStart.y);
      applyViewportTransform();
    }

    if (isDraggingBlock) {
      handleBlockDragMove(e);
    }

    if (drawingEdge) {
      handleEdgeDrawMove(e);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      document.getElementById('canvasContainer').classList.remove('panning');
      scheduleSave();
    }

    if (isDraggingBlock) {
      handleBlockDragEnd(e);
    }

    if (drawingEdge) {
      handleEdgeDrawEnd(e);
    }
  });

  // Zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -0.04 : 0.04;
    const minZoom = getFitZoom();
    const newZoom = Math.max(minZoom, Math.min(MAX_ZOOM, viewport.zoom + delta));

    if (newZoom !== viewport.zoom) {
      // Zoom towards mouse position
      const ratio = newZoom / viewport.zoom;
      viewport.x = mouseX - ratio * (mouseX - viewport.x);
      viewport.y = mouseY - ratio * (mouseY - viewport.y);
      viewport.zoom = newZoom;
      applyViewportTransform();
      updateZoomDisplay();
      scheduleSave();
    }
  }, { passive: false });

  // Zoom buttons
  document.getElementById('zoomInBtn')?.addEventListener('click', () => {
    zoomTo(viewport.zoom + 0.1);
  });
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
    zoomTo(viewport.zoom - 0.1);
  });
  document.getElementById('fitViewBtn')?.addEventListener('click', fitView);
}

function applyViewportTransform() {
  const vp = document.getElementById('canvasViewport');
  vp.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  // Counter-scale text so it stays readable at any zoom
  const compensate = Math.min(1 / viewport.zoom, 2);
  vp.style.setProperty('--zc', compensate);
  vp.classList.toggle('zoom-mid', viewport.zoom < 0.55);
  updateZoomDisplay();
}

function updateZoomDisplay() {
  const el = document.getElementById('zoomLevel');
  if (el) el.textContent = Math.round(viewport.zoom * 100) + '%';
}

function zoomTo(newZoom) {
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  newZoom = Math.max(getFitZoom(), Math.min(MAX_ZOOM, newZoom));
  const ratio = newZoom / viewport.zoom;
  viewport.x = cx - ratio * (cx - viewport.x);
  viewport.y = cy - ratio * (cy - viewport.y);
  viewport.zoom = newZoom;
  applyViewportTransform();
  scheduleSave();
}

function getFitZoom() {
  if (!currentBoard) return MIN_ZOOM;
  const blocks = Object.values(currentBoard.blocks || {});
  if (blocks.length === 0) return 1;

  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const padding = 80;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  blocks.forEach(b => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + BLOCK_WIDTH);
    maxY = Math.max(maxY, b.y + 160);
  });

  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  return Math.max(MIN_ZOOM, Math.min(rect.width / contentW, rect.height / contentH, MAX_ZOOM));
}

function fitView() {
  if (!currentBoard) return;
  const blocks = Object.values(currentBoard.blocks || {});
  if (blocks.length === 0) {
    viewport = { x: 0, y: 0, zoom: 1 };
    applyViewportTransform();
    return;
  }

  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const padding = 80;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  blocks.forEach(b => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + BLOCK_WIDTH);
    maxY = Math.max(maxY, b.y + 160);
  });

  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  viewport.zoom = getFitZoom();
  viewport.x = (rect.width - contentW * viewport.zoom) / 2 - minX * viewport.zoom + padding * viewport.zoom;
  viewport.y = (rect.height - contentH * viewport.zoom) / 2 - minY * viewport.zoom + padding * viewport.zoom;

  applyViewportTransform();
  scheduleSave();
}

// ========== Block Rendering ==========

function createBlockElement(block) {
  const el = document.createElement('div');
  el.className = 'flow-block';
  el.dataset.blockId = block.id;
  el.style.left = block.x + 'px';
  el.style.top = block.y + 'px';

  if (block.category) {
    el.dataset.category = block.category;
  } else if (block.color) {
    el.style.borderLeftColor = block.color;
  }

  const quotePreview = (block.quote || '').length > 120
    ? block.quote.substring(0, 120) + '...'
    : (block.quote || '');

  const sourceText = block.source?.text || '';
  const zoteroKey = block.source?.zoteroKey;
  const hasZotero = !!block.source?.zoteroUrl;
  const hasPdf = !!block.pdf?.url;

  let paperTitle = block.paperTitle || '';
  if (!paperTitle && zoteroKey) {
    const paper = papers.find(p => p.zotero_key === zoteroKey);
    if (paper) paperTitle = paper.title;
  }

  const explorerLink = zoteroKey ? `/?paper=${zoteroKey}` : null;
  const isUnlinked = sourceText && !block.paperId;
  const headerLabel = sourceText || paperTitle || (block.myNote || '').split('\n')[0] || 'No source';

  el.innerHTML = `
    <div class="flow-block-header">
      ${isUnlinked ? '<span class="flow-block-unlinked" title="Not linked to Zotero"><i data-lucide="link-2-off"></i></span>' : ''}
      <span class="flow-block-paper-title" title="${escapeHtml(paperTitle || headerLabel)}">${escapeHtml(headerLabel)}</span>
      <div class="flow-block-actions">
        <button class="flow-block-action edit" title="Edit"><i data-lucide="pencil"></i></button>
        <button class="flow-block-action delete" title="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    <div class="flow-block-quote">${escapeHtml(quotePreview)}</div>
    ${block.myNote ? `<div class="flow-block-note">${escapeHtml(block.myNote)}</div>` : ''}
    <div class="flow-block-links">
      ${explorerLink ? `<a href="${explorerLink}" target="_blank" class="flow-block-link" title="Explorer"><i data-lucide="compass"></i></a>` : ''}
      ${hasZotero ? `<a href="${block.source.zoteroUrl}" class="flow-block-link" title="Zotero"><i data-lucide="book-open"></i></a>` : ''}
      ${hasPdf ? `<a href="${block.pdf.url}" class="flow-block-link" title="PDF${block.pdf.page ? ' p.' + block.pdf.page : ''}"><i data-lucide="file-text"></i></a>` : ''}
    </div>
    <div class="connector connector-in" data-block-id="${block.id}" data-side="in"></div>
    <div class="connector connector-out" data-block-id="${block.id}" data-side="out"></div>
  `;

  // Block actions
  el.querySelector('.flow-block-action.edit')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditBlockModal(block.id);
  });
  el.querySelector('.flow-block-action.delete')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Delete this block?')) {
      deleteBlock(block.id);
    }
  });

  // Block drag
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.connector') || e.target.closest('button') || e.target.closest('a')) return;
    e.stopPropagation();

    selectBlock(block.id);

    isDraggingBlock = {
      blockId: block.id,
      element: el,
      offsetX: (e.clientX - viewport.x) / viewport.zoom - block.x,
      offsetY: (e.clientY - viewport.y) / viewport.zoom - block.y,
      moved: false
    };
    el.classList.add('dragging');
  });

  // Click to show paper detail
  el.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.connector')) return;
    if (isDraggingBlock?.moved) return;

    const zk = block.source?.zoteroKey;
    let paper = null;
    if (zk) paper = papers.find(p => p.zotero_key === zk);
    if (!paper && block.paperId) paper = papers.find(p => p.id === block.paperId);
    if (paper) {
      showPaperDetail(paper.id);
      openDetailPanel();
    }
  });

  // Connector drag to create edges
  el.querySelector('.connector-out')?.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    startEdgeDraw(block.id, e);
  });

  return el;
}

function selectBlock(blockId) {
  deselectAll();
  selectedBlockId = blockId;
  const el = document.querySelector(`.flow-block[data-block-id="${blockId}"]`);
  if (el) el.classList.add('selected');
}

function deselectAll() {
  selectedBlockId = null;
  selectedEdgeId = null;
  document.querySelectorAll('.flow-block.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.flow-edge.selected').forEach(el => el.classList.remove('selected'));
}

// ========== Block Drag ==========

function handleBlockDragMove(e) {
  if (!isDraggingBlock) return;

  const newX = (e.clientX - viewport.x) / viewport.zoom - isDraggingBlock.offsetX;
  const newY = (e.clientY - viewport.y) / viewport.zoom - isDraggingBlock.offsetY;

  isDraggingBlock.element.style.left = newX + 'px';
  isDraggingBlock.element.style.top = newY + 'px';
  isDraggingBlock.moved = true;

  // Update block data
  if (currentBoard?.blocks[isDraggingBlock.blockId]) {
    currentBoard.blocks[isDraggingBlock.blockId].x = newX;
    currentBoard.blocks[isDraggingBlock.blockId].y = newY;
  }

  // Update connected edges
  updateEdgesForBlock(isDraggingBlock.blockId);
}

function handleBlockDragEnd(e) {
  if (!isDraggingBlock) return;
  isDraggingBlock.element.classList.remove('dragging');
  isDraggingBlock = null;
  scheduleSave();
}

// ========== Edge Rendering ==========

function clearSvgEdges() {
  const svg = document.getElementById('svgLayer');
  svg.querySelectorAll('.flow-edge, .flow-edge-label').forEach(el => el.remove());
}

function renderAllEdges() {
  clearSvgEdges();
  if (!currentBoard) return;

  const svg = document.getElementById('svgLayer');
  currentBoard.edges.forEach(edge => {
    const path = createEdgePath(edge);
    if (path) svg.appendChild(path);
  });
}

function createEdgePath(edge) {
  const fromBlock = currentBoard.blocks[edge.from];
  const toBlock = currentBoard.blocks[edge.to];
  if (!fromBlock || !toBlock) return null;

  const d = computeEdgePath(fromBlock, toBlock);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', 'flow-edge');
  path.setAttribute('marker-end', 'url(#arrowhead)');
  path.dataset.edgeId = edge.id;
  path.style.pointerEvents = 'stroke';

  path.addEventListener('click', (e) => {
    e.stopPropagation();
    selectEdge(edge.id);
  });

  return path;
}

function computeEdgePath(fromBlock, toBlock) {
  // From: right center of fromBlock
  const fromEl = document.querySelector(`.flow-block[data-block-id="${fromBlock.id}"]`);
  const toEl = document.querySelector(`.flow-block[data-block-id="${toBlock.id}"]`);

  const fromH = fromEl ? fromEl.offsetHeight : 120;
  const toH = toEl ? toEl.offsetHeight : 120;

  const x1 = fromBlock.x + BLOCK_WIDTH;
  const y1 = fromBlock.y + fromH / 2;
  const x2 = toBlock.x;
  const y2 = toBlock.y + toH / 2;

  const dx = Math.abs(x2 - x1);
  const cpOffset = Math.max(60, dx * 0.4);

  return `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
}

function updateEdgesForBlock(blockId) {
  if (!currentBoard) return;

  currentBoard.edges.forEach(edge => {
    if (edge.from === blockId || edge.to === blockId) {
      const fromBlock = currentBoard.blocks[edge.from];
      const toBlock = currentBoard.blocks[edge.to];
      if (!fromBlock || !toBlock) return;

      const pathEl = document.querySelector(`.flow-edge[data-edge-id="${edge.id}"]`);
      if (pathEl) {
        pathEl.setAttribute('d', computeEdgePath(fromBlock, toBlock));
      }
    }
  });
}

function selectEdge(edgeId) {
  deselectAll();
  selectedEdgeId = edgeId;
  const el = document.querySelector(`.flow-edge[data-edge-id="${edgeId}"]`);
  if (el) el.classList.add('selected');
}

// ========== Edge Drawing ==========

function startEdgeDraw(fromBlockId, e) {
  const svg = document.getElementById('svgLayer');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'flow-edge-temp');
  line.setAttribute('marker-end', 'url(#arrowhead)');

  const block = currentBoard.blocks[fromBlockId];
  const fromEl = document.querySelector(`.flow-block[data-block-id="${fromBlockId}"]`);
  const fromH = fromEl ? fromEl.offsetHeight : 120;

  const startX = block.x + BLOCK_WIDTH;
  const startY = block.y + fromH / 2;

  line.setAttribute('x1', startX);
  line.setAttribute('y1', startY);
  line.setAttribute('x2', startX);
  line.setAttribute('y2', startY);

  svg.appendChild(line);

  drawingEdge = {
    fromBlockId,
    tempLine: line,
    startX,
    startY
  };
}

function handleEdgeDrawMove(e) {
  if (!drawingEdge) return;

  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
  const canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom;

  drawingEdge.tempLine.setAttribute('x2', canvasX);
  drawingEdge.tempLine.setAttribute('y2', canvasY);

  // Highlight potential target
  document.querySelectorAll('.flow-block.edge-target').forEach(el => el.classList.remove('edge-target'));

  const targetEl = getBlockAtPoint(e.clientX, e.clientY);
  if (targetEl && targetEl.dataset.blockId !== drawingEdge.fromBlockId) {
    targetEl.classList.add('edge-target');
  }
}

function handleEdgeDrawEnd(e) {
  if (!drawingEdge) return;

  document.querySelectorAll('.flow-block.edge-target').forEach(el => el.classList.remove('edge-target'));

  const targetEl = getBlockAtPoint(e.clientX, e.clientY);

  if (targetEl && targetEl.dataset.blockId !== drawingEdge.fromBlockId) {
    createEdge(drawingEdge.fromBlockId, targetEl.dataset.blockId);
  }

  drawingEdge.tempLine.remove();
  drawingEdge = null;
}

function getBlockAtPoint(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const blockEl = el.closest('.flow-block');
    if (blockEl) return blockEl;
  }
  return null;
}

// ========== Block/Edge CRUD ==========

function createBlock(annotationData, x, y) {
  if (!currentBoard) return;

  const block = {
    id: annotationData.id || generateAnnotationId(),
    x: x,
    y: y,
    quote: annotationData.quote || '',
    source: annotationData.source || {},
    pdf: annotationData.pdf || null,
    myNote: annotationData.myNote || '',
    paperId: annotationData.paperId || null,
    paperTitle: annotationData.paperTitle || null,
    color: annotationData.color || null,
    createdAt: annotationData.createdAt || Date.now()
  };

  currentBoard.blocks[block.id] = block;

  const el = createBlockElement(block);
  document.getElementById('blockLayer').appendChild(el);
  lucide.createIcons();

  // Remove empty state if present
  document.querySelector('.canvas-area .empty-state')?.remove();

  scheduleSave();
  return block;
}

function deleteBlock(blockId) {
  if (!currentBoard) return;

  // Remove connected edges
  currentBoard.edges = currentBoard.edges.filter(e => e.from !== blockId && e.to !== blockId);

  // Remove block data
  delete currentBoard.blocks[blockId];

  // Remove DOM
  document.querySelector(`.flow-block[data-block-id="${blockId}"]`)?.remove();

  // Re-render edges
  renderAllEdges();
  scheduleSave();
}

function createEdge(fromId, toId) {
  if (!currentBoard) return;

  // Check for duplicates
  const exists = currentBoard.edges.some(e => e.from === fromId && e.to === toId);
  if (exists) return;

  const edge = {
    id: 'edge_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6),
    from: fromId,
    to: toId,
    label: ''
  };

  currentBoard.edges.push(edge);

  const svg = document.getElementById('svgLayer');
  const path = createEdgePath(edge);
  if (path) svg.appendChild(path);

  scheduleSave();
}

function deleteEdge(edgeId) {
  if (!currentBoard) return;

  currentBoard.edges = currentBoard.edges.filter(e => e.id !== edgeId);
  renderAllEdges();
  selectedEdgeId = null;
  scheduleSave();
}

// ========== Event Listeners ==========

function setupEventListeners() {
  // Board select
  document.getElementById('boardSelect')?.addEventListener('change', async (e) => {
    if (e.target.value) {
      await selectBoard(e.target.value);
    }
  });

  // New board
  document.getElementById('newBoardBtn')?.addEventListener('click', openNewBoardModal);
  document.getElementById('cancelNewBoard')?.addEventListener('click', closeNewBoardModal);
  document.getElementById('createNewBoard')?.addEventListener('click', async () => {
    const title = document.getElementById('newBoardTitle').value.trim();
    if (!title) return;
    const board = await createBoardAPI(title);
    if (board) {
      allBoards.push({ id: board.id, title: board.title, blockCount: 0, edgeCount: 0 });
      updateBoardSelect();
      await selectBoard(board.id);
    }
    closeNewBoardModal();
  });

  // Board title
  document.getElementById('boardTitle')?.addEventListener('blur', () => {
    if (!currentBoard) return;
    const newTitle = document.getElementById('boardTitle').value.trim();
    if (newTitle !== currentBoard.title) {
      currentBoard.title = newTitle;
      const boardMeta = allBoards.find(b => b.id === currentBoard.id);
      if (boardMeta) boardMeta.title = newTitle;
      updateBoardSelect();
      scheduleSave();
    }
  });

  document.getElementById('boardTitle')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });

  // Delete board
  document.getElementById('deleteBoardBtn')?.addEventListener('click', async () => {
    if (!currentBoard) return;
    if (!confirm(`Delete board "${currentBoard.title}"?`)) return;
    const success = await deleteBoardAPI(currentBoard.id);
    if (success) {
      allBoards = allBoards.filter(b => b.id !== currentBoard.id);
      currentBoard = null;
      updateBoardSelect();
      document.getElementById('boardTitle').value = '';
      renderEmptyState();
    }
  });

  // Add block
  document.getElementById('addBlockBtn')?.addEventListener('click', () => openAddBlockModal());

  // Import
  document.getElementById('importAnnotationsBtn')?.addEventListener('click', openImportModal);
  document.getElementById('closeImportModal')?.addEventListener('click', closeImportModal);
  document.getElementById('cancelImport')?.addEventListener('click', closeImportModal);
  document.getElementById('confirmImport')?.addEventListener('click', importSelectedAnnotations);
  document.getElementById('importSearchInput')?.addEventListener('input', (e) => {
    renderImportPapersList(e.target.value);
  });

  // Export
  document.getElementById('exportBtn')?.addEventListener('click', exportBoard);
  document.getElementById('closeExportModal')?.addEventListener('click', closeExportModal);
  document.getElementById('copyExport')?.addEventListener('click', copyExport);

  // Edit block modal
  document.getElementById('closeEditCard')?.addEventListener('click', closeEditBlockModal);
  document.getElementById('cancelEditCard')?.addEventListener('click', closeEditBlockModal);
  document.getElementById('saveEditCard')?.addEventListener('click', saveEditBlock);

  // Edit block modal — paste annotation toggle
  document.getElementById('editCardPasteToggle')?.addEventListener('click', () => {
    const section = document.querySelector('.edit-card-paste-section');
    const body = document.getElementById('editCardPasteBody');
    if (!section || !body) return;
    const isOpen = section.classList.toggle('open');
    body.style.display = isOpen ? 'block' : 'none';
    if (isOpen) document.getElementById('editCardPasteRaw')?.focus();
  });
  document.getElementById('editCardPasteRaw')?.addEventListener('input', onEditCardPasteAnnotation);

  // Edit block modal — paper search & ref links
  document.getElementById('editCardPaperSearchInput')?.addEventListener('input', onEditCardPaperSearch);
  document.getElementById('editCardUnlinkPaper')?.addEventListener('click', () => {
    updatePaperLinkDisplay(null, null);
    lucide.createIcons();
  });
  document.getElementById('editCardZoteroUrl')?.addEventListener('input', (e) => {
    updateRefLinkButton('editCardZoteroOpen', e.target.value);
  });
  document.getElementById('editCardPdfUrl')?.addEventListener('input', (e) => {
    updateRefLinkButton('editCardPdfOpen', e.target.value);
  });

  // Add block modal
  document.getElementById('closeAddCard')?.addEventListener('click', closeAddBlockModal);
  document.getElementById('cancelAddCard')?.addEventListener('click', closeAddBlockModal);
  document.getElementById('confirmAddCard')?.addEventListener('click', confirmAddBlock);
  document.getElementById('addCardRaw')?.addEventListener('input', updateAddBlockPreview);

  // New board modal Enter key
  document.getElementById('newBoardTitle')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('createNewBoard').click();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Delete selected edge or block
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (selectedEdgeId) {
        deleteEdge(selectedEdgeId);
      } else if (selectedBlockId) {
        if (confirm('Delete this block?')) {
          deleteBlock(selectedBlockId);
        }
      }
    }
    // Escape to deselect
    if (e.key === 'Escape') {
      deselectAll();
      closeModals();
    }
  });
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

// ========== Modals ==========

function openNewBoardModal() {
  document.getElementById('newBoardTitle').value = '';
  document.getElementById('newBoardModal').style.display = 'flex';
  document.getElementById('newBoardTitle').focus();
}

function closeNewBoardModal() {
  document.getElementById('newBoardModal').style.display = 'none';
}

function openEditBlockModal(blockId) {
  if (!currentBoard) return;
  const block = currentBoard.blocks[blockId];
  if (!block) return;

  editingBlockId = blockId;
  document.getElementById('editCardCategory').value = block.category || '';
  document.getElementById('editCardQuote').value = block.quote || '';
  document.getElementById('editCardSource').value = block.source?.text || '';
  document.getElementById('editCardNote').value = block.myNote || '';

  // Ref links
  const zoteroUrlEl = document.getElementById('editCardZoteroUrl');
  const pdfUrlEl = document.getElementById('editCardPdfUrl');
  if (zoteroUrlEl) zoteroUrlEl.value = block.source?.zoteroUrl || '';
  if (pdfUrlEl) pdfUrlEl.value = block.pdf?.url || '';
  updateRefLinkButton('editCardZoteroOpen', block.source?.zoteroUrl);
  updateRefLinkButton('editCardPdfOpen', block.pdf?.url);

  // Paper link
  updatePaperLinkDisplay(block.paperId, block.paperTitle);

  // Clear search
  const searchInput = document.getElementById('editCardPaperSearchInput');
  const searchResults = document.getElementById('editCardPaperResults');
  if (searchInput) searchInput.value = '';
  if (searchResults) {
    searchResults.innerHTML = '';
    searchResults.classList.remove('has-results');
  }

  // Reset paste section
  const pasteSection = document.querySelector('.edit-card-paste-section');
  const pasteBody = document.getElementById('editCardPasteBody');
  const pasteRaw = document.getElementById('editCardPasteRaw');
  if (pasteSection) pasteSection.classList.remove('open');
  if (pasteBody) pasteBody.style.display = 'none';
  if (pasteRaw) pasteRaw.value = '';

  document.getElementById('editCardModal').style.display = 'flex';
  lucide.createIcons();
}

function closeEditBlockModal() {
  editingBlockId = null;
  editingPaperId = null;
  editingPaperTitle = null;
  document.getElementById('editCardModal').style.display = 'none';
}

function saveEditBlock() {
  if (!editingBlockId || !currentBoard) return;

  const block = currentBoard.blocks[editingBlockId];
  if (!block) return;

  block.category = document.getElementById('editCardCategory').value || null;
  block.color = null; // category takes precedence
  block.quote = document.getElementById('editCardQuote').value.trim();

  // Source fields
  const zoteroUrl = (document.getElementById('editCardZoteroUrl')?.value || '').trim();
  const zoteroKeyMatch = zoteroUrl.match(/items\/([A-Z0-9]+)/i);
  block.source = {
    ...block.source,
    text: document.getElementById('editCardSource').value.trim(),
    zoteroUrl: zoteroUrl || undefined,
    zoteroKey: zoteroKeyMatch ? zoteroKeyMatch[1] : (block.source?.zoteroKey || undefined)
  };

  // PDF fields
  const pdfUrl = (document.getElementById('editCardPdfUrl')?.value || '').trim();
  const pageMatch = pdfUrl.match(/page=(\d+)/);
  if (pdfUrl) {
    block.pdf = {
      ...(block.pdf || {}),
      url: pdfUrl,
      page: pageMatch ? parseInt(pageMatch[1]) : (block.pdf?.page || null)
    };
  } else {
    block.pdf = null;
  }

  // Paper link
  block.paperId = editingPaperId;
  block.paperTitle = editingPaperTitle;

  block.myNote = document.getElementById('editCardNote').value.trim();

  // Re-render this block
  const oldEl = document.querySelector(`.flow-block[data-block-id="${editingBlockId}"]`);
  if (oldEl) {
    const newEl = createBlockElement(block);
    oldEl.replaceWith(newEl);
    lucide.createIcons();
  }

  closeEditBlockModal();
  scheduleSave();
}

let parsedAddBlockData = null;

function openAddBlockModal() {
  if (!currentBoard) {
    alert('Please create or select a board first');
    return;
  }
  parsedAddBlockData = null;
  document.getElementById('addCardRaw').value = '';
  document.getElementById('addCardPreview').innerHTML = '';
  document.getElementById('addCardPreview').classList.remove('has-content');
  document.getElementById('addCardModal').style.display = 'flex';
  document.getElementById('addCardRaw').focus();
}

function closeAddBlockModal() {
  parsedAddBlockData = null;
  document.getElementById('addCardModal').style.display = 'none';
}

function updateAddBlockPreview() {
  const rawText = document.getElementById('addCardRaw').value.trim();
  const preview = document.getElementById('addCardPreview');

  if (!rawText) {
    preview.classList.remove('has-content');
    preview.innerHTML = '';
    parsedAddBlockData = null;
    return;
  }

  const parsed = parseRawAnnotation(rawText);

  // Auto-match reference paper title to papers array
  if (parsed.referencePaperTitle) {
    const refTitle = parsed.referencePaperTitle.toLowerCase();
    const match = papers.find(p => {
      const pt = (p.title || '').toLowerCase();
      return pt === refTitle || pt.includes(refTitle) || refTitle.includes(pt);
    });
    if (match) {
      parsed.paperId = match.id;
      parsed.paperTitle = match.title;
    }
  }

  parsedAddBlockData = parsed;

  if (parsed.quote) {
    // Build paper match HTML
    let paperMatchHtml = '';
    if (parsed.referencePaperTitle) {
      const matched = parsed.paperId != null;
      paperMatchHtml = `
        <div class="preview-paper-match ${matched ? 'matched' : ''}">
          <span class="preview-paper-icon">${matched ? '<i data-lucide="check-circle-2"></i>' : '<i data-lucide="circle-help"></i>'}</span>
          <span class="preview-paper-title">${escapeHtml(parsed.referencePaperTitle)}</span>
          ${matched ? '<span class="preview-paper-badge">Linked</span>' : '<span class="preview-paper-badge unmatched">Not found</span>'}
        </div>
      `;
    }

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
      ${paperMatchHtml}
    `;
    lucide.createIcons();
  } else {
    preview.classList.remove('has-content');
    preview.innerHTML = '';
  }
}

function confirmAddBlock() {
  const rawText = document.getElementById('addCardRaw').value.trim();
  if (!rawText) {
    alert('Please paste an annotation');
    return;
  }

  const data = parsedAddBlockData || parseRawAnnotation(rawText);
  if (!data.quote) {
    alert('Could not parse annotation. Make sure it contains a quoted text.');
    return;
  }

  // Place at center of viewport
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const cx = (rect.width / 2 - viewport.x) / viewport.zoom;
  const cy = (rect.height / 2 - viewport.y) / viewport.zoom;

  createBlock(data, cx - BLOCK_WIDTH / 2, cy - 60);
  closeAddBlockModal();
}

// ========== Import ==========

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
  const papersWithAnnotations = papers.filter(p => hasAnnotations(p));

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
  const existingBlocks = Object.values(currentBoard.blocks);

  // Grid layout: 4 columns, 320x280 spacing
  const cols = 4;
  const spacingX = 320;
  const spacingY = 280;

  // Find starting position (below existing blocks)
  let startY = 0;
  if (existingBlocks.length > 0) {
    startY = Math.max(...existingBlocks.map(b => b.y)) + spacingY;
  }

  let idx = existingBlocks.length;

  paperIds.forEach(paperId => {
    const paper = papers.find(p => p.id === paperId);
    if (!paper) return;

    const noteText = paper.notes_html || paper.notes;
    const annotations = parseAnnotationsFromNote(noteText, paper);

    annotations.forEach(ann => {
      // Check duplicate
      const exists = existingBlocks.some(
        b => b.quote === ann.quote && b.paperId === ann.paperId
      );
      if (!exists) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = col * spacingX;
        const y = startY + row * spacingY;

        createBlock(ann, x, y);
        importedCount++;
        idx++;
      }
    });
  });

  closeImportModal();

  if (importedCount > 0) {
    fitView();
    alert(`Imported ${importedCount} annotations`);
  } else {
    alert('No new annotations to import (duplicates skipped)');
  }
}

// ========== Export ==========

function exportBoard() {
  if (!currentBoard) return;

  const blocks = currentBoard.blocks || {};
  const edges = currentBoard.edges || [];

  // Topological sort via BFS from root blocks
  const ordered = topologicalSort(blocks, edges);
  if (ordered.length === 0) return;

  // Build index map: blockId → display number
  const idxMap = {};
  ordered.forEach((b, i) => { idxMap[b.id] = i + 1; });

  // Build incoming edges map
  const incomingMap = {};
  edges.forEach(e => {
    if (blocks[e.from] && blocks[e.to]) {
      if (!incomingMap[e.to]) incomingMap[e.to] = [];
      incomingMap[e.to].push(e.from);
    }
  });

  let md = `# ${currentBoard.title}\n\n`;
  md += `> ${ordered.length} blocks · ${edges.length} connections · Exported ${new Date().toLocaleString()}\n\n`;

  // ── Flow Map ──
  if (edges.length > 0) {
    md += `## Flow Map\n\n`;
    md += '```\n';
    ordered.forEach((block, i) => {
      const num = i + 1;
      const label = (block.source?.text || block.paperTitle || '').substring(0, 30) || `Block ${num}`;
      const outEdges = edges.filter(e => e.from === block.id);
      if (outEdges.length > 0) {
        const targets = outEdges.map(e => {
          const tNum = idxMap[e.to];
          const target = blocks[e.to];
          const tLabel = (target?.source?.text || target?.paperTitle || '').substring(0, 30) || `Block ${tNum}`;
          return `[${tNum}] ${tLabel}`;
        });
        targets.forEach(t => {
          md += `[${num}] ${label}  →  ${t}\n`;
        });
      }
    });
    md += '```\n\n';
  }

  // ── Blocks ──
  md += `## Blocks\n\n`;

  ordered.forEach((block, i) => {
    const num = i + 1;

    // Header with number and paper title
    md += `### [${num}]`;
    if (block.paperTitle) {
      md += ` ${block.paperTitle}`;
    }
    md += '\n\n';

    // Quote
    if (block.quote) {
      md += `> \u201C${block.quote}\u201D\n`;
    }

    // Source line
    if (block.source?.text) {
      md += `> \u2014 ${block.source.text}`;
      if (block.pdf?.page) md += `, p.${block.pdf.page}`;
      md += '\n';
    }
    md += '\n';

    // Links
    const links = [];
    if (block.source?.zoteroUrl) links.push(`[Zotero](${block.source.zoteroUrl})`);
    if (block.pdf?.url) links.push(`[PDF${block.pdf.page ? ' p.' + block.pdf.page : ''}](${block.pdf.url})`);
    if (links.length > 0) {
      md += links.join(' · ') + '\n\n';
    }

    // My note
    if (block.myNote) {
      md += `**Note:** ${block.myNote}\n\n`;
    }

    // Connections
    const incoming = (incomingMap[block.id] || []).map(id => `[${idxMap[id]}]`);
    const outgoing = edges.filter(e => e.from === block.id).map(e => `[${idxMap[e.to]}]`);

    if (incoming.length > 0 || outgoing.length > 0) {
      const parts = [];
      if (incoming.length > 0) parts.push(`${incoming.join(', ')} → **[${num}]**`);
      if (outgoing.length > 0) parts.push(`**[${num}]** → ${outgoing.join(', ')}`);
      md += parts.join(' · ') + '\n\n';
    }

    md += '---\n\n';
  });

  document.getElementById('exportContent').value = md;
  document.getElementById('exportModal').style.display = 'flex';
}

function topologicalSort(blocks, edges) {
  const blockIds = Object.keys(blocks);
  if (blockIds.length === 0) return [];

  // Build adjacency and in-degree
  const inDegree = {};
  const adj = {};
  blockIds.forEach(id => {
    inDegree[id] = 0;
    adj[id] = [];
  });

  edges.forEach(e => {
    if (blocks[e.from] && blocks[e.to]) {
      adj[e.from].push(e.to);
      inDegree[e.to] = (inDegree[e.to] || 0) + 1;
    }
  });

  // BFS from roots
  const queue = blockIds.filter(id => inDegree[id] === 0);
  const visited = new Set();
  const ordered = [];

  // Sort roots by y-coordinate
  queue.sort((a, b) => (blocks[a].y || 0) - (blocks[b].y || 0));

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    ordered.push(blocks[id]);

    const neighbors = adj[id] || [];
    neighbors.sort((a, b) => (blocks[a].y || 0) - (blocks[b].y || 0));
    neighbors.forEach(n => {
      if (!visited.has(n)) {
        queue.push(n);
      }
    });
  }

  // Add any unvisited blocks (disconnected), sorted by y
  blockIds
    .filter(id => !visited.has(id))
    .sort((a, b) => (blocks[a].y || 0) - (blocks[b].y || 0))
    .forEach(id => ordered.push(blocks[id]));

  return ordered;
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

// ========== localStorage Migration ==========

async function migrateFromLocalStorage() {
  const saved = localStorage.getItem('annotationBoards');
  if (!saved) return;

  let oldBoards;
  try {
    oldBoards = JSON.parse(saved);
  } catch (e) {
    return;
  }

  if (!oldBoards || oldBoards.length === 0) return;

  if (!confirm(`Found ${oldBoards.length} board(s) in local storage. Migrate to server?`)) return;

  let migrated = 0;
  for (const oldBoard of oldBoards) {
    // Convert columns+cards to blocks
    const blocks = {};
    const columns = oldBoard.columns || [];

    columns.forEach((col, colIdx) => {
      const xOffset = colIdx * 340;
      const cardIds = col.cardIds || [];
      cardIds.forEach((cardId, cardIdx) => {
        const card = oldBoard.cards?.[cardId];
        if (!card) return;

        blocks[card.id] = {
          id: card.id,
          x: xOffset,
          y: cardIdx * 260,
          quote: card.quote || '',
          source: card.source || {},
          pdf: card.pdf || null,
          myNote: card.myNote || '',
          paperId: card.paperId || null,
          paperTitle: card.paperTitle || null,
          color: card.color || null,
          createdAt: card.createdAt || Date.now()
        };
      });
    });

    const newBoard = await createBoardAPI(oldBoard.title || 'Migrated Board');
    if (newBoard) {
      await updateBoardAPI(newBoard.id, { blocks, edges: [] });
      migrated++;
    }
  }

  if (migrated > 0) {
    localStorage.removeItem('annotationBoards');
    await fetchBoards();
    if (allBoards.length > 0) {
      await selectBoard(allBoards[allBoards.length - 1].id);
    }
    alert(`Migrated ${migrated} board(s) to server`);
  }
}

// ========== Paper Detail Panel ==========

let paperSearch = null;
let paperDetailPanel = null;

function initPaperDetailPanel() {
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

  document.getElementById('boardDetailToggle')?.addEventListener('click', () => {
    const isOpen = paperDetailPanel.toggle();
    if (isOpen) {
      document.getElementById('boardSearchInput').focus();
    }
  });

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

// ========== Edit Modal Helpers ==========

function onEditCardPasteAnnotation(e) {
  const rawText = e.target.value.trim();
  if (!rawText) return;

  const parsed = parseRawAnnotation(rawText);
  if (!parsed.quote) return;

  // Fill all fields from parsed data
  const quoteEl = document.getElementById('editCardQuote');
  const sourceEl = document.getElementById('editCardSource');
  const noteEl = document.getElementById('editCardNote');
  const zoteroUrlEl = document.getElementById('editCardZoteroUrl');
  const pdfUrlEl = document.getElementById('editCardPdfUrl');

  if (quoteEl) quoteEl.value = parsed.quote;
  if (sourceEl) sourceEl.value = parsed.source?.text || '';
  if (noteEl) noteEl.value = parsed.myNote || '';
  if (zoteroUrlEl) {
    zoteroUrlEl.value = parsed.source?.zoteroUrl || '';
    updateRefLinkButton('editCardZoteroOpen', parsed.source?.zoteroUrl);
  }
  if (pdfUrlEl) {
    pdfUrlEl.value = parsed.pdf?.url || '';
    updateRefLinkButton('editCardPdfOpen', parsed.pdf?.url);
  }

  // Auto-match reference paper
  if (parsed.referencePaperTitle) {
    const refTitle = parsed.referencePaperTitle.toLowerCase();
    const match = papers.find(p => {
      const pt = (p.title || '').toLowerCase();
      return pt === refTitle || pt.includes(refTitle) || refTitle.includes(pt);
    });
    if (match) {
      updatePaperLinkDisplay(match.id, match.title);
    } else {
      updatePaperLinkDisplay(null, null);
    }
  }

  // Collapse paste section after filling
  const section = document.querySelector('.edit-card-paste-section');
  const body = document.getElementById('editCardPasteBody');
  if (section && body) {
    section.classList.remove('open');
    body.style.display = 'none';
  }
  e.target.value = '';

  lucide.createIcons();
}

function updatePaperLinkDisplay(paperId, paperTitle) {
  editingPaperId = paperId;
  editingPaperTitle = paperTitle;

  const linkedEl = document.getElementById('editCardPaperLinked');
  const searchEl = document.getElementById('editCardPaperSearch');
  if (!linkedEl || !searchEl) return;

  if (paperId && paperTitle) {
    const titleEl = document.getElementById('editCardPaperTitle');
    if (titleEl) titleEl.textContent = paperTitle;
    linkedEl.style.display = 'flex';
    searchEl.style.display = 'none';
  } else {
    linkedEl.style.display = 'none';
    searchEl.style.display = 'block';
  }
}

function onEditCardPaperSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  const resultsEl = document.getElementById('editCardPaperResults');

  if (!query || query.length < 2) {
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('has-results');
    return;
  }

  const matches = papers.filter(p => {
    const title = (p.title || '').toLowerCase();
    const authors = (p.authors || '').toLowerCase();
    return title.includes(query) || authors.includes(query);
  }).slice(0, 5);

  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="paper-link-result" style="cursor:default;opacity:0.6;"><div class="paper-link-result-info"><div class="paper-link-result-meta">No papers found</div></div></div>';
    resultsEl.classList.add('has-results');
    return;
  }

  resultsEl.innerHTML = matches.map(p => `
    <div class="paper-link-result" data-paper-id="${p.id}">
      <div class="paper-link-result-info">
        <div class="paper-link-result-title">${escapeHtml(p.title)}</div>
        <div class="paper-link-result-meta">${escapeHtml(abbreviateAuthors(p.authors))} · ${p.year || '?'}</div>
      </div>
      <div class="paper-link-result-action"><i data-lucide="arrow-right"></i></div>
    </div>
  `).join('');
  lucide.createIcons();
  resultsEl.classList.add('has-results');

  // Click handler for each result
  resultsEl.querySelectorAll('.paper-link-result').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.paperId;
      const paper = papers.find(pp => String(pp.id) === pid);
      if (!paper) return;

      updatePaperLinkDisplay(paper.id, paper.title);

      // Auto-fill source text if empty
      const sourceInput = document.getElementById('editCardSource');
      if (sourceInput && !sourceInput.value.trim()) {
        sourceInput.value = abbreviateAuthors(paper.authors) + (paper.year ? ', ' + paper.year : '');
      }

      // Auto-fill zotero URL if empty
      const zoteroInput = document.getElementById('editCardZoteroUrl');
      if (zoteroInput && !zoteroInput.value.trim() && paper.zotero_key) {
        const url = getZoteroUrl(paper.zotero_key);
        zoteroInput.value = url;
        updateRefLinkButton('editCardZoteroOpen', url);
      }

      // Clear search
      const searchInputEl = document.getElementById('editCardPaperSearchInput');
      if (searchInputEl) searchInputEl.value = '';
      resultsEl.innerHTML = '';
      resultsEl.classList.remove('has-results');

      lucide.createIcons();
    });
  });
}

function updateRefLinkButton(buttonId, url) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  if (url && url.trim()) {
    btn.href = url.trim();
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
  }
}

// ========== Utilities ==========

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function abbreviateAuthors(authors) {
  if (!authors) return '';
  const parts = authors.split(',').map(a => a.trim());
  if (parts.length <= 2) return authors;
  return parts[0] + ' et al.';
}
