/* ===========================================
   Advanced Search / Filter Pipeline
   =========================================== */

let filterBlocks = [];
let blockIdCounter = 0;

// ============================================================
// Modal Management
// ============================================================

function openAdvancedSearch() {
  const modal = document.getElementById('advancedSearchModal');
  modal.classList.add('active');

  // Update total count
  document.getElementById('pipelineTotal').textContent = allPapers.filter(p => p.has_notes).length;

  // Render existing blocks
  renderPipelineBlocks();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function closeAdvancedSearch() {
  const modal = document.getElementById('advancedSearchModal');
  modal.classList.remove('active');
}

// ============================================================
// Filter Block Management
// ============================================================

function addFilterBlock(type = 'cluster') {
  const block = {
    id: ++blockIdCounter,
    type: type,
    value: null,
    resultCount: 0
  };
  filterBlocks.push(block);
  renderPipelineBlocks();
  recalculatePipeline();
}

function removeFilterBlock(blockId) {
  filterBlocks = filterBlocks.filter(b => b.id !== blockId);
  renderPipelineBlocks();
  recalculatePipeline();
}

function moveFilterBlock(blockId, direction) {
  const idx = filterBlocks.findIndex(b => b.id === blockId);
  if (idx === -1) return;

  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= filterBlocks.length) return;

  // Swap
  [filterBlocks[idx], filterBlocks[newIdx]] = [filterBlocks[newIdx], filterBlocks[idx]];
  renderPipelineBlocks();
  recalculatePipeline();
}

function updateBlockType(blockId, newType) {
  const block = filterBlocks.find(b => b.id === blockId);
  if (!block) return;

  block.type = newType;
  block.value = null;
  renderPipelineBlocks();
  recalculatePipeline();
}

function updateBlockValue(blockId, value) {
  const block = filterBlocks.find(b => b.id === blockId);
  if (!block) return;

  console.log('updateBlockValue:', blockId, value, block.type);
  block.value = value;
  recalculatePipeline();
}

// ============================================================
// Render Pipeline
// ============================================================

function renderPipelineBlocks() {
  const container = document.getElementById('pipelineBlocks');
  container.innerHTML = '';

  for (const block of filterBlocks) {
    const blockEl = createBlockElement(block);
    container.appendChild(blockEl);
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function createBlockElement(block) {
  const div = document.createElement('div');
  div.className = 'filter-block';
  div.dataset.blockId = block.id;

  div.innerHTML = `
    <div class="filter-block-header">
      <select class="filter-type-select">
        <option value="cluster" ${block.type === 'cluster' ? 'selected' : ''}>Cluster</option>
        <option value="tag" ${block.type === 'tag' ? 'selected' : ''}>Tag</option>
        <option value="year" ${block.type === 'year' ? 'selected' : ''}>Year Range</option>
        <option value="text" ${block.type === 'text' ? 'selected' : ''}>Text Search</option>
        <option value="semantic" ${block.type === 'semantic' ? 'selected' : ''}>AI Semantic</option>
        <option value="venue" ${block.type === 'venue' ? 'selected' : ''}>Venue Quality</option>
        <option value="bookmarked" ${block.type === 'bookmarked' ? 'selected' : ''}>Bookmarked</option>
        <option value="idea" ${block.type === 'idea' ? 'selected' : ''}>Idea Papers</option>
        <option value="idea-nearby" ${block.type === 'idea-nearby' ? 'selected' : ''}>Idea + Nearby</option>
      </select>
      <div class="filter-block-actions">
        <button class="btn-move-up" title="Move up"><i data-lucide="chevron-up"></i></button>
        <button class="btn-move-down" title="Move down"><i data-lucide="chevron-down"></i></button>
        <button class="btn-remove-block" title="Remove"><i data-lucide="x"></i></button>
      </div>
    </div>
    <div class="filter-block-content">
      ${getBlockContentHtml(block)}
    </div>
    <div class="filter-block-footer">
      <span class="block-arrow"><i data-lucide="arrow-down"></i></span>
      <span class="block-result-count">${block.resultCount}</span>
    </div>
  `;

  // Event listeners
  div.querySelector('.filter-type-select').addEventListener('change', (e) => {
    updateBlockType(block.id, e.target.value);
  });

  div.querySelector('.btn-move-up').addEventListener('click', () => {
    moveFilterBlock(block.id, 'up');
  });

  div.querySelector('.btn-move-down').addEventListener('click', () => {
    moveFilterBlock(block.id, 'down');
  });

  div.querySelector('.btn-remove-block').addEventListener('click', () => {
    removeFilterBlock(block.id);
  });

  // Content-specific event listeners
  setupBlockContentListeners(div, block);

  return div;
}

function getBlockContentHtml(block) {
  switch (block.type) {
    case 'cluster':
      const clusterOptions = Object.entries(clusterLabels)
        .map(([id, label]) => `<option value="${id}" ${block.value == id ? 'selected' : ''}>${label || 'Cluster ' + id}</option>`)
        .join('');
      return `<select class="block-cluster-select"><option value="">Select cluster...</option>${clusterOptions}</select>`;

    case 'tag':
      const tagOptions = [...allTags]
        .sort()
        .map(tag => `<option value="${tag}" ${block.value === tag ? 'selected' : ''}>${tag}</option>`)
        .join('');
      return `<select class="block-tag-select"><option value="">Select tag...</option>${tagOptions}</select>`;

    case 'year':
      const yearVal = block.value || { min: 2015, max: 2025 };
      return `
        <div class="year-range">
          <input type="number" class="block-year-min" value="${yearVal.min}" min="1990" max="2030">
          <span>~</span>
          <input type="number" class="block-year-max" value="${yearVal.max}" min="1990" max="2030">
        </div>
      `;

    case 'text':
      return `<input type="text" class="block-text-input" placeholder="Search title, authors, abstract..." value="${block.value || ''}">`;

    case 'semantic':
      const semQuery = block.value?.query || '';
      const semThreshold = block.value?.threshold || 30;
      return `
        <input type="text" class="block-semantic-input" placeholder="찾고 싶은 내용을 설명하세요..." value="${semQuery}">
        <div class="semantic-threshold">
          <label>유사도 ≥ <span class="threshold-value">${semThreshold}%</span></label>
          <input type="range" class="block-threshold-slider" min="10" max="80" value="${semThreshold}">
        </div>
        <div class="semantic-hint"></div>
      `;

    case 'venue':
      return `
        <select class="block-venue-select">
          <option value="0" ${block.value == 0 ? 'selected' : ''}>All</option>
          <option value="3" ${block.value == 3 ? 'selected' : ''}>3+ (Good)</option>
          <option value="4" ${block.value == 4 ? 'selected' : ''}>4+ (Great)</option>
          <option value="5" ${block.value == 5 ? 'selected' : ''}>5 (Top)</option>
        </select>
      `;

    case 'bookmarked':
      return `<div style="text-align: center; color: var(--text-muted); font-size: 12px;">Show only bookmarked papers</div>`;

    case 'idea':
      const ideaOptions = (typeof allIdeas !== 'undefined' ? allIdeas : [])
        .map(idea => `<option value="${idea.zotero_key}" ${block.value === idea.zotero_key ? 'selected' : ''}>${idea.title}</option>`)
        .join('');
      return `<select class="block-idea-select"><option value="">Select idea...</option>${ideaOptions}</select>`;

    case 'idea-nearby':
      const ideaOptions2 = (typeof allIdeas !== 'undefined' ? allIdeas : [])
        .map(idea => `<option value="${idea.zotero_key}" ${block.value?.ideaKey === idea.zotero_key ? 'selected' : ''}>${idea.title}</option>`)
        .join('');
      const proximity = block.value?.proximity || 40;
      return `
        <select class="block-idea-select""><option value="">Select idea...</option>${ideaOptions2}</select>
        <div style="margin-top: 8px;">
          <label style="font-size: 11px; color: var(--text-muted);">근접도: <span class="proximity-value">${proximity}</span>%</label>
          <input type="range" class="block-proximity-slider" min="5" max="50" value="${proximity}" style="width: 100%;">
        </div>
      `;

    default:
      return '';
  }
}

function setupBlockContentListeners(blockEl, block) {
  const clusterSelect = blockEl.querySelector('.block-cluster-select');
  if (clusterSelect) {
    clusterSelect.addEventListener('change', (e) => {
      updateBlockValue(block.id, e.target.value || null);
    });
  }

  const tagSelect = blockEl.querySelector('.block-tag-select');
  if (tagSelect) {
    tagSelect.addEventListener('change', (e) => {
      updateBlockValue(block.id, e.target.value || null);
    });
  }

  const yearMin = blockEl.querySelector('.block-year-min');
  const yearMax = blockEl.querySelector('.block-year-max');
  if (yearMin && yearMax) {
    const updateYear = () => {
      updateBlockValue(block.id, { min: parseInt(yearMin.value), max: parseInt(yearMax.value) });
    };
    yearMin.addEventListener('change', updateYear);
    yearMax.addEventListener('change', updateYear);
    // Initialize value
    if (!block.value) {
      block.value = { min: parseInt(yearMin.value), max: parseInt(yearMax.value) };
    }
  }

  const textInput = blockEl.querySelector('.block-text-input');
  if (textInput) {
    let debounceTimer;
    textInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateBlockValue(block.id, e.target.value || null);
      }, 300);
    });
  }

  const semanticInput = blockEl.querySelector('.block-semantic-input');
  const thresholdSlider = blockEl.querySelector('.block-threshold-slider');
  const thresholdValue = blockEl.querySelector('.threshold-value');

  if (semanticInput) {
    let debounceTimer;

    const updateSemantic = () => {
      const query = semanticInput.value || '';
      const threshold = parseInt(thresholdSlider?.value || 30);
      updateBlockValue(block.id, { query, threshold });
    };

    semanticInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateSemantic, 1000);
    });
    semanticInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(debounceTimer);
        updateSemantic();
      }
    });

    if (thresholdSlider) {
      thresholdSlider.addEventListener('input', () => {
        if (thresholdValue) thresholdValue.textContent = thresholdSlider.value + '%';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateSemantic, 500);
      });
    }
  }

  const venueSelect = blockEl.querySelector('.block-venue-select');
  if (venueSelect) {
    venueSelect.addEventListener('change', (e) => {
      updateBlockValue(block.id, parseInt(e.target.value));
    });
  }

  // Bookmarked doesn't need listeners - it's always active when present
  if (block.type === 'bookmarked') {
    block.value = true;
  }

  // Idea filter
  const ideaSelect = blockEl.querySelector('.block-idea-select');
  if (ideaSelect && block.type === 'idea') {
    ideaSelect.addEventListener('change', (e) => {
      updateBlockValue(block.id, e.target.value || null);
    });
  }

  // Idea + Nearby filter
  if (ideaSelect && block.type === 'idea-nearby') {
    const proximitySlider = blockEl.querySelector('.block-proximity-slider');
    const proximityValue = blockEl.querySelector('.proximity-value');
    let sliderDebounce = null;

    const updateIdeaNearby = (immediate = false) => {
      const ideaKey = ideaSelect.value || null;
      const proximity = parseInt(proximitySlider?.value || 40);
      if (proximityValue) proximityValue.textContent = proximity;

      if (immediate) {
        updateBlockValue(block.id, ideaKey ? { ideaKey, proximity } : null);
      } else {
        clearTimeout(sliderDebounce);
        sliderDebounce = setTimeout(() => {
          updateBlockValue(block.id, ideaKey ? { ideaKey, proximity } : null);
        }, 150);
      }
    };

    ideaSelect.addEventListener('change', () => updateIdeaNearby(true));
    if (proximitySlider) {
      proximitySlider.addEventListener('input', () => updateIdeaNearby(false));
    }
  }
}

// ============================================================
// Pipeline Calculation
// ============================================================

async function recalculatePipeline() {
  let papers = allPapers.filter(p => p.has_notes);

  for (const block of filterBlocks) {
    const blockEl = document.querySelector(`.filter-block[data-block-id="${block.id}"]`);

    // Show loading state for blocks that may take time
    if (block.type === 'semantic' || block.type === 'idea-nearby') {
      if (blockEl) {
        blockEl.classList.add('loading');
        blockEl.querySelector('.block-result-count').textContent = '...';
      }
    }

    papers = await applyBlockFilter(papers, block);
    block.resultCount = papers.length;

    // Update count and remove loading state
    if (blockEl) {
      blockEl.classList.remove('loading');
      blockEl.querySelector('.block-result-count').textContent = block.resultCount;
    }
  }
}

async function applyBlockFilter(papers, block) {
  if (!block.value && block.type !== 'bookmarked') return papers;

  switch (block.type) {
    case 'cluster':
      return papers.filter(p => p.cluster == block.value);

    case 'tag':
      return papers.filter(p => {
        const tags = (p.tags || '').split(/[;,]/).map(t => t.trim().toLowerCase());
        return tags.includes(block.value.toLowerCase());
      });

    case 'year':
      return papers.filter(p => {
        if (!p.year) return false;
        return p.year >= block.value.min && p.year <= block.value.max;
      });

    case 'text':
      const query = block.value.toLowerCase();
      return papers.filter(p => {
        const text = `${p.title} ${p.authors || ''} ${p.abstract || ''} ${p.notes || ''}`.toLowerCase();
        return text.includes(query);
      });

    case 'semantic':
      return await applySemanticFilter(papers, block.value);

    case 'venue':
      return papers.filter(p => p.venue_quality >= block.value);

    case 'bookmarked':
      return papers.filter(p => bookmarkedPapers.has(p.id));

    case 'idea':
      return applyIdeaFilter(papers, block.value);

    case 'idea-nearby':
      return applyIdeaNearbyFilter(papers, block.value);

    default:
      return papers;
  }
}

function applyIdeaFilter(papers, ideaKey) {
  if (!ideaKey) return papers;

  const idea = (typeof allIdeas !== 'undefined' ? allIdeas : []).find(i => i.zotero_key === ideaKey);
  if (!idea || !idea.connected_papers || idea.connected_papers.length === 0) {
    return [];
  }

  const connectedKeys = new Set(idea.connected_papers);
  return papers.filter(p => connectedKeys.has(p.zotero_key));
}

function applyIdeaNearbyFilter(papers, value) {
  if (!value || !value.ideaKey) return papers;

  const idea = (typeof allIdeas !== 'undefined' ? allIdeas : []).find(i => i.zotero_key === value.ideaKey);
  if (!idea || !idea.connected_papers || idea.connected_papers.length === 0) {
    return [];
  }

  // Get connected papers with their coordinates
  const connectedPapers = idea.connected_papers
    .map(key => allPapers.find(p => p.zotero_key === key))
    .filter(Boolean);

  if (connectedPapers.length === 0) return [];

  // Calculate map diagonal for percentage-based distance
  const xMin = Math.min(...allPapers.map(p => p.x));
  const xMax = Math.max(...allPapers.map(p => p.x));
  const yMin = Math.min(...allPapers.map(p => p.y));
  const yMax = Math.max(...allPapers.map(p => p.y));
  const mapDiagonal = Math.sqrt(Math.pow(xMax - xMin, 2) + Math.pow(yMax - yMin, 2));

  // 근접도 슬라이더: 높을수록 더 가까운 것만 포함 (반경 감소)
  // proximity 5% → radius 50%, proximity 50% → radius 5%
  const proximity = value.proximity || 40;
  const radiusPercent = 55 - proximity;
  const maxDistance = (radiusPercent / 100) * mapDiagonal;

  // Filter papers that are either connected OR within distance of any connected paper
  return papers.filter(p => {
    // If it's a connected paper, include it
    if (idea.connected_papers.includes(p.zotero_key)) return true;

    // Check distance to any connected paper
    for (const cp of connectedPapers) {
      const dist = Math.sqrt(Math.pow(p.x - cp.x, 2) + Math.pow(p.y - cp.y, 2));
      if (dist <= maxDistance) return true;
    }
    return false;
  });
}

async function applySemanticFilter(papers, value) {
  const query = value?.query || '';
  const threshold = (value?.threshold || 30) / 100;  // Convert to 0-1 range

  console.log('applySemanticFilter called:', query, 'threshold:', threshold, 'papers:', papers.length);
  const blockEl = document.querySelector(`.filter-block[data-block-id="${filterBlocks.find(b => b.type === 'semantic')?.id}"]`);

  if (!query || query.length < 2) {
    // Show hint message
    if (blockEl) {
      const hint = blockEl.querySelector('.semantic-hint');
      if (hint) hint.textContent = query ? '2글자 이상 입력하세요' : '';
    }
    return papers;
  }

  // Clear hint
  if (blockEl) {
    const hint = blockEl.querySelector('.semantic-hint');
    if (hint) hint.textContent = '';
  }

  // Mark block as loading
  if (blockEl) blockEl.classList.add('loading');

  try {
    const response = await fetch(`${API_BASE}/semantic-search?q=${encodeURIComponent(query)}&top_k=200`, {
      method: 'GET',
      headers: {
        'X-API-Key': getApiKey()
      }
    });

    if (!response.ok) {
      console.error('Semantic search failed');
      return papers;
    }

    const data = await response.json();
    const results = data.results || [];
    console.log('Semantic search results:', results.length);

    // Filter by threshold and match with current papers
    const paperIds = new Set(papers.map(p => p.id));
    const filtered = results.filter(r => r.similarity >= threshold && paperIds.has(r.id));

    // Build similarity map and filter papers
    const simMap = new Map(filtered.map(r => [r.id, r.similarity]));
    return papers
      .filter(p => simMap.has(p.id))
      .sort((a, b) => (simMap.get(b.id) || 0) - (simMap.get(a.id) || 0));

  } catch (e) {
    console.error('Semantic search error:', e);
    return papers;
  } finally {
    if (blockEl) blockEl.classList.remove('loading');
  }
}

function renderBlockCounts() {
  for (const block of filterBlocks) {
    const blockEl = document.querySelector(`.filter-block[data-block-id="${block.id}"]`);
    if (blockEl) {
      blockEl.querySelector('.block-result-count').textContent = block.resultCount;
    }
  }
}

// ============================================================
// Apply Pipeline to Main View
// ============================================================

async function applyPipelineToMainView() {
  let papers = allPapers.filter(p => p.has_notes);

  for (const block of filterBlocks) {
    papers = await applyBlockFilter(papers, block);
    block.resultCount = papers.length;  // Update count after each filter
  }
  renderBlockCounts();  // Update UI with counts

  // Update main view
  currentFiltered = papers;

  if (currentView === 'map') {
    render(currentFiltered);
  } else if (currentView === 'list') {
    renderListView(currentFiltered);
  } else {
    renderTimeline(currentFiltered);
  }

  updateStats(currentFiltered);
  updateFilterChipsFromPipeline();
  closeAdvancedSearch();
}

function updateFilterChipsFromPipeline() {
  // Clear existing filters
  highlightCluster = null;
  document.getElementById('tagFilter').value = '';
  document.getElementById('searchFilter').value = '';
  yearRange = null;
  document.getElementById('bookmarkedOnly').checked = false;

  // Create custom chips for pipeline
  const container = document.getElementById('filterChips');
  container.innerHTML = '';

  if (filterBlocks.length > 0) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.style.background = '#8b5cf61a';
    chip.style.borderColor = '#8b5cf6';
    chip.style.color = '#8b5cf6';
    chip.innerHTML = `<i data-lucide="sliders-horizontal"></i> ${filterBlocks.length} filters <span class="chip-close"><i data-lucide="x"></i></span>`;
    chip.onclick = () => {
      filterBlocks = [];
      currentFiltered = allPapers.filter(p => p.has_notes);
      if (currentView === 'map') {
        render(currentFiltered);
      } else if (currentView === 'list') {
        renderListView(currentFiltered);
      } else {
        renderTimeline(currentFiltered);
      }
      updateStats(currentFiltered);
      updateFilterChips();
    };
    container.appendChild(chip);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

function resetPipeline() {
  filterBlocks = [];
  blockIdCounter = 0;
  renderPipelineBlocks();
  document.getElementById('pipelineTotal').textContent = allPapers.filter(p => p.has_notes).length;
}

// ============================================================
// Initialize
// ============================================================

function initAdvancedSearch() {
  // Open button
  document.getElementById('advancedSearchBtn')?.addEventListener('click', openAdvancedSearch);

  // Close button
  document.getElementById('closeAdvancedSearch')?.addEventListener('click', closeAdvancedSearch);

  // Click outside to close
  document.getElementById('advancedSearchModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'advancedSearchModal') {
      closeAdvancedSearch();
    }
  });

  // Add filter button
  document.getElementById('addFilterBlock')?.addEventListener('click', () => {
    addFilterBlock('cluster');
  });

  // Apply button
  document.getElementById('applyPipeline')?.addEventListener('click', applyPipelineToMainView);

  // Reset button
  document.getElementById('resetPipeline')?.addEventListener('click', resetPipeline);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initAdvancedSearch);
