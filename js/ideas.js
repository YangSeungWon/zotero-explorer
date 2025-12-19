/* ===========================================
   Ideas (Brainstorming) Module
   =========================================== */

// Ideas state
let allIdeas = [];
let selectedIdea = null;
let isSaving = false;       // Prevent double submissions

const IDEA_STATUSES = {
  drafting: { label: 'Drafting', color: '#6c757d' },
  exploring: { label: 'Exploring', color: '#0d6efd' },
  reviewing: { label: 'Reviewing', color: '#198754' },
  archived: { label: 'Archived', color: '#adb5bd' }
};

// ============================================================
// API Functions
// ============================================================

async function fetchIdeas() {
  try {
    const response = await fetch(`${API_BASE}/ideas`);
    const data = await response.json();
    if (data.success) {
      allIdeas = data.ideas || [];
      return allIdeas;
    } else {
      console.error('Failed to fetch ideas:', data.error);
      return [];
    }
  } catch (error) {
    console.error('Error fetching ideas:', error);
    return [];
  }
}

async function createIdea(ideaData) {
  try {
    const response = await fetch(`${API_BASE}/ideas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': getApiKey()
      },
      body: JSON.stringify(ideaData)
    });
    const data = await response.json();
    if (data.success) {
      allIdeas.push(data.idea);
      return data.idea;
    } else {
      console.error('Failed to create idea:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Error creating idea:', error);
    return null;
  }
}

async function updateIdea(zoteroKey, ideaData) {
  try {
    const response = await fetch(`${API_BASE}/ideas/${zoteroKey}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': getApiKey()
      },
      body: JSON.stringify(ideaData)
    });
    const data = await response.json();
    if (data.success) {
      // Update local cache
      const idx = allIdeas.findIndex(i => i.zotero_key === zoteroKey);
      if (idx >= 0) {
        allIdeas[idx] = { ...allIdeas[idx], ...ideaData };
      }
      return true;
    } else {
      console.error('Failed to update idea:', data.error);
      return false;
    }
  } catch (error) {
    console.error('Error updating idea:', error);
    return false;
  }
}

async function deleteIdea(zoteroKey) {
  try {
    const response = await fetch(`${API_BASE}/ideas/${zoteroKey}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': getApiKey()
      }
    });
    const data = await response.json();
    if (data.success) {
      allIdeas = allIdeas.filter(i => i.zotero_key !== zoteroKey);
      return true;
    } else {
      console.error('Failed to delete idea:', data.error);
      return false;
    }
  } catch (error) {
    console.error('Error deleting idea:', error);
    return false;
  }
}

async function addPaperToIdea(ideaKey, paperKey) {
  try {
    const response = await fetch(`${API_BASE}/ideas/${ideaKey}/papers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': getApiKey()
      },
      body: JSON.stringify({ paper_key: paperKey })
    });
    const data = await response.json();
    if (data.success) {
      // Update local cache
      const idea = allIdeas.find(i => i.zotero_key === ideaKey);
      if (idea) {
        idea.connected_papers = data.connected_papers;
      }
      return data.connected_papers;
    } else {
      console.error('Failed to add paper:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Error adding paper:', error);
    return null;
  }
}

async function removePaperFromIdea(ideaKey, paperKey) {
  try {
    const response = await fetch(`${API_BASE}/ideas/${ideaKey}/papers/${paperKey}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': getApiKey()
      }
    });
    const data = await response.json();
    if (data.success) {
      // Update local cache
      const idea = allIdeas.find(i => i.zotero_key === ideaKey);
      if (idea) {
        idea.connected_papers = data.connected_papers;
      }
      return data.connected_papers;
    } else {
      console.error('Failed to remove paper:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Error removing paper:', error);
    return null;
  }
}

// ============================================================
// UI Rendering
// ============================================================

function renderIdeasPanel() {
  const container = document.getElementById('ideasContainer');
  if (!container) return;

  // Update section title with count
  const titleEl = document.querySelector('.ideas-section-title');
  if (titleEl) {
    titleEl.textContent = `Ideas${allIdeas.length > 0 ? ` (${allIdeas.length})` : ''}`;
  }

  if (allIdeas.length === 0) {
    container.innerHTML = `
      <div class="ideas-empty">
        <p>No ideas yet.</p>
        <p>Start brainstorming!</p>
      </div>
    `;
    return;
  }

  // Group by status
  const grouped = {};
  for (const status of Object.keys(IDEA_STATUSES)) {
    grouped[status] = allIdeas.filter(i => i.status === status);
  }

  let html = '';
  for (const [status, ideas] of Object.entries(grouped)) {
    if (ideas.length === 0) continue;

    const statusInfo = IDEA_STATUSES[status];
    html += `
      <div class="ideas-group">
        <div class="ideas-group-header" style="border-left-color: ${statusInfo.color}">
          ${statusInfo.label} (${ideas.length})
        </div>
        <div class="ideas-list">
    `;

    for (const idea of ideas) {
      const isSelected = selectedIdea?.zotero_key === idea.zotero_key;
      const paperCount = idea.connected_papers?.length || 0;
      const clusters = getIdeaRelatedClusters(idea);

      html += `
        <div class="idea-card ${isSelected ? 'selected' : ''}" data-idea-key="${idea.zotero_key}">
          <div class="idea-title">${escapeHtml(idea.title)}</div>
          <div class="idea-meta">
            <span class="idea-papers-count" title="Connected papers">${paperCount} papers</span>
            ${clusters.length > 0 ? `<span class="idea-clusters" title="Related clusters">${clusters.slice(0, 2).join(', ')}${clusters.length > 2 ? '...' : ''}</span>` : ''}
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.idea-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.ideaKey;
      const idea = allIdeas.find(i => i.zotero_key === key);
      if (idea) {
        selectIdea(idea);
      }
    });
  });
}

function renderIdeaDetail(idea) {
  const container = document.getElementById('ideaDetail');
  if (!container) return;

  if (!idea) {
    container.innerHTML = `
      <div class="idea-detail-empty">
        Select an idea or create a new one
      </div>
    `;
    return;
  }

  const statusInfo = IDEA_STATUSES[idea.status] || IDEA_STATUSES.drafting;
  const connectedPapers = (idea.connected_papers || [])
    .map(key => allPapers.find(p => p.zotero_key === key))
    .filter(Boolean);
  const clusters = getIdeaRelatedClusters(idea);

  let html = `
    <div class="idea-detail-header">
      <input type="text" class="idea-title-input" value="${escapeHtml(idea.title)}" data-field="title">
      <div class="idea-detail-actions">
        <div class="idea-saving-indicator" style="display: none">
          <span class="saving-spinner"></span>
          <span class="saving-text">Saving...</span>
        </div>
        <button class="btn-icon btn-danger" id="deleteIdeaBtn" title="Delete idea"><i data-lucide="trash-2"></i></button>
      </div>
    </div>

    <div class="idea-detail-status">
      <label>Status:</label>
      <select class="idea-status-select" data-field="status">
        ${Object.entries(IDEA_STATUSES).map(([key, info]) => `
          <option value="${key}" ${idea.status === key ? 'selected' : ''}>${info.label}</option>
        `).join('')}
      </select>
    </div>

    <div class="idea-detail-description">
      <label>Description:</label>
      <textarea class="idea-description-input" data-field="description" rows="4">${escapeHtml(idea.description || '')}</textarea>
    </div>

    <div class="idea-detail-keywords">
      <label>Keywords to Explore:</label>
      <div class="keywords-list">
        ${(idea.keywords || []).map(kw => `
          <span class="keyword-tag">
            ${escapeHtml(kw)}
            <button class="keyword-remove" data-keyword="${escapeHtml(kw)}" title="Remove">×</button>
          </span>
        `).join('')}
        <div class="keyword-add">
          <input type="text" class="keyword-input" placeholder="Add keyword..." />
          <button class="keyword-add-btn" title="Add"><i data-lucide="plus"></i></button>
        </div>
      </div>
    </div>

    <div class="idea-detail-clusters">
      <label>Related Clusters:</label>
      <div class="idea-clusters-list">
        ${clusters.length > 0 ? clusters.map(c => `<span class="cluster-tag">${c}</span>`).join('') : '<span class="no-clusters">No clusters yet</span>'}
      </div>
    </div>

    <div class="idea-detail-papers">
      <label>Connected Papers (${connectedPapers.length}):</label>
      <div class="connected-papers-list">
  `;

  if (connectedPapers.length === 0) {
    html += `<div class="no-papers">No papers connected. Click <i data-lucide="paperclip" style="display:inline;width:14px;height:14px;vertical-align:middle;"></i> to link papers from the map.</div>`;
  } else {
    for (const paper of connectedPapers) {
      // Format: year Author et al. Title
      const year = paper.year || '';
      const firstAuthor = paper.authors ? paper.authors.split(/[,;]/)[0].trim() : '';
      html += `
        <div class="connected-paper-item" data-paper-id="${paper.id}">
          <span class="cp-year">${year}</span>
          ${firstAuthor ? `<span class="cp-author">${escapeHtml(firstAuthor)}<span class="cp-etal">et al.</span></span>` : ''}
          <span class="cp-title">${escapeHtml(paper.title)}</span>
          <button class="btn-remove-paper" data-paper-key="${paper.zotero_key}" title="Remove">×</button>
        </div>
      `;
    }
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Render Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Add event handlers
  const titleInput = container.querySelector('.idea-title-input');
  const descInput = container.querySelector('.idea-description-input');
  const statusSelect = container.querySelector('.idea-status-select');

  titleInput.addEventListener('change', () => saveIdeaField(idea.zotero_key, 'title', titleInput.value));
  descInput.addEventListener('change', () => saveIdeaField(idea.zotero_key, 'description', descInput.value));
  statusSelect.addEventListener('change', () => saveIdeaField(idea.zotero_key, 'status', statusSelect.value));

  document.getElementById('deleteIdeaBtn').addEventListener('click', () => confirmDeleteIdea(idea));

  // Keyword handlers
  const keywordInput = container.querySelector('.keyword-input');
  const keywordAddBtn = container.querySelector('.keyword-add-btn');

  const addKeyword = async () => {
    if (isSaving) return;
    const kw = keywordInput.value.trim();
    if (!kw) return;

    const keywords = idea.keywords || [];
    if (!keywords.includes(kw)) {
      keywords.push(kw);
      idea.keywords = keywords;
      keywordInput.value = '';
      showSavingIndicator('saving');
      const success = await updateIdea(idea.zotero_key, { keywords });
      showSavingIndicator(success ? 'saved' : 'failed');
      if (success) renderIdeaDetail(idea);
    } else {
      keywordInput.value = '';
    }
  };

  keywordAddBtn?.addEventListener('click', addKeyword);
  keywordInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
    }
  });

  container.querySelectorAll('.keyword-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (isSaving) return;
      const kw = btn.dataset.keyword;
      const keywords = (idea.keywords || []).filter(k => k !== kw);
      idea.keywords = keywords;
      showSavingIndicator('saving');
      const success = await updateIdea(idea.zotero_key, { keywords });
      showSavingIndicator(success ? 'saved' : 'failed');
      if (success) renderIdeaDetail(idea);
    });
  });

  container.querySelectorAll('.btn-remove-paper').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isSaving) return;
      const paperKey = btn.dataset.paperKey;
      showSavingIndicator('saving');
      const result = await removePaperFromIdea(idea.zotero_key, paperKey);
      showSavingIndicator(result !== null ? 'saved' : 'failed');
      if (result !== null) {
        renderIdeaDetail(idea);
        highlightIdeaPapers(idea);
      }
    });
  });

  // Click on connected paper to select it
  container.querySelectorAll('.connected-paper-item[data-paper-id]').forEach(item => {
    item.addEventListener('click', () => {
      const paperId = parseInt(item.dataset.paperId);
      const paper = allPapers.find(p => p.id === paperId);
      if (paper && typeof showDetail === 'function') {
        showDetail(paper);
      }
    });
  });
}

// ============================================================
// Idea Operations
// ============================================================

function showSavingIndicator(state) {
  // state: 'saving', 'saved', 'failed', or false to hide
  isSaving = (state === 'saving');

  // Toggle disabled class on container
  const container = document.getElementById('ideaDetail');
  if (container) {
    container.classList.toggle('is-saving', isSaving);
  }

  const indicator = document.querySelector('.idea-saving-indicator');
  if (!indicator) return;

  if (!state) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'flex';
  const spinner = indicator.querySelector('.saving-spinner');
  const text = indicator.querySelector('.saving-text');

  if (state === 'saving') {
    spinner.style.display = 'block';
    text.textContent = 'Saving...';
    indicator.classList.remove('saved', 'failed');
  } else if (state === 'saved') {
    spinner.style.display = 'none';
    text.textContent = 'Saved!';
    indicator.classList.add('saved');
    indicator.classList.remove('failed');
    // Auto-hide after 1.5s
    setTimeout(() => {
      indicator.style.display = 'none';
      indicator.classList.remove('saved');
    }, 1500);
  } else if (state === 'failed') {
    spinner.style.display = 'none';
    text.textContent = 'Failed';
    indicator.classList.add('failed');
    indicator.classList.remove('saved');
    // Auto-hide after 2s
    setTimeout(() => {
      indicator.style.display = 'none';
      indicator.classList.remove('failed');
    }, 2000);
  }
}

function selectIdea(idea) {
  selectedIdea = idea;
  renderIdeasPanel();
  renderIdeaDetail(idea);
  highlightIdeaPapers(idea);
}

async function saveIdeaField(zoteroKey, field, value) {
  if (isSaving) return;
  const idea = allIdeas.find(i => i.zotero_key === zoteroKey);
  if (!idea) return;

  idea[field] = value;
  showSavingIndicator('saving');

  const success = await updateIdea(zoteroKey, { [field]: value });
  showSavingIndicator(success ? 'saved' : 'failed');

  if (success) {
    renderIdeasPanel();
    if (field === 'status') {
      renderIdeaDetail(idea);
    }
  }
}

async function confirmDeleteIdea(idea) {
  if (!confirm(`Delete idea "${idea.title}"?`)) return;

  const success = await deleteIdea(idea.zotero_key);
  if (success) {
    selectedIdea = null;
    renderIdeasPanel();
    renderIdeaDetail(null);
    // Clear highlights
    render(currentFiltered);
  }
}


// ============================================================
// Map Integration
// ============================================================

function getIdeaRelatedClusters(idea) {
  const connectedPapers = (idea.connected_papers || [])
    .map(key => allPapers.find(p => p.zotero_key === key))
    .filter(Boolean);

  // Count papers per cluster
  const clusterCounts = {};
  for (const paper of connectedPapers) {
    const cluster = paper.cluster;
    const label = clusterLabels[cluster] || `Cluster ${cluster}`;
    clusterCounts[label] = (clusterCounts[label] || 0) + 1;
  }

  // Sort by count and return labels
  return Object.entries(clusterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);
}

function highlightIdeaPapers(idea) {
  if (!idea || !idea.connected_papers || idea.connected_papers.length === 0) {
    // Clear idea highlights
    connectedPapers.clear();
    render(currentFiltered);
    return;
  }

  // Set connected papers for highlighting
  connectedPapers.clear();
  for (const key of idea.connected_papers) {
    const paper = allPapers.find(p => p.zotero_key === key);
    if (paper) {
      connectedPapers.add(paper.id);
    }
  }

  render(currentFiltered);
}

// ============================================================
// New Idea Dialog
// ============================================================

function showNewIdeaDialog() {
  const modal = document.getElementById('newIdeaModal');
  if (!modal) return;

  document.getElementById('newIdeaTitle').value = '';
  document.getElementById('newIdeaDescription').value = '';
  document.getElementById('newIdeaStatus').value = 'drafting';

  modal.style.display = 'flex';
}

function hideNewIdeaDialog() {
  const modal = document.getElementById('newIdeaModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function submitNewIdea() {
  const title = document.getElementById('newIdeaTitle').value.trim();
  const description = document.getElementById('newIdeaDescription').value.trim();
  const status = document.getElementById('newIdeaStatus').value;
  const submitBtn = document.getElementById('submitNewIdea');

  if (!title) {
    alert('Title is required');
    return;
  }

  // Disable button while submitting
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
  }

  try {
    const idea = await createIdea({ title, description, status });
    if (idea) {
      hideNewIdeaDialog();
      renderIdeasPanel();
      selectIdea(idea);
    }
  } finally {
    // Re-enable button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create';
    }
  }
}

// ============================================================
// Initialization
// ============================================================

let currentDetailTab = 'paper'; // 'paper' or 'ideas'

function switchDetailTab(tab) {
  currentDetailTab = tab;
  const paperSection = document.getElementById('paperDetailSection');
  const ideasSection = document.getElementById('ideasSection');
  const tabPaper = document.getElementById('tabPaper');
  const tabIdeas = document.getElementById('tabIdeas');

  if (tab === 'paper') {
    paperSection.style.display = '';
    ideasSection.style.display = 'none';
    tabPaper.classList.add('active');
    tabIdeas.classList.remove('active');
  } else {
    paperSection.style.display = 'none';
    ideasSection.style.display = '';
    tabPaper.classList.remove('active');
    tabIdeas.classList.add('active');
  }
}

function initDetailTabs() {
  const tabPaper = document.getElementById('tabPaper');
  const tabIdeas = document.getElementById('tabIdeas');

  if (tabPaper) {
    tabPaper.addEventListener('click', () => switchDetailTab('paper'));
  }
  if (tabIdeas) {
    tabIdeas.addEventListener('click', () => switchDetailTab('ideas'));
  }

  // Initialize icons
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initIdeasPanel() {
  // Initialize tabs
  initDetailTabs();

  // New idea button
  const newBtn = document.getElementById('newIdeaBtn');
  if (newBtn) {
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showNewIdeaDialog();
    });
  }

  // Modal handlers
  const modal = document.getElementById('newIdeaModal');
  if (modal) {
    document.getElementById('cancelNewIdea').addEventListener('click', hideNewIdeaDialog);
    document.getElementById('submitNewIdea').addEventListener('click', submitNewIdea);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideNewIdeaDialog();
      }
    });
  }

  // Initial fetch
  fetchIdeas().then(() => {
    renderIdeasPanel();
  });
}

// Helper function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
