/* ===========================================
   Ideas (Brainstorming) Module
   =========================================== */

// Ideas state
let allIdeas = [];
let selectedIdea = null;
let linkPaperMode = false;  // When true, clicking papers links them to selected idea

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
        <button class="btn-icon" id="toggleLinkMode" title="Link papers from map">
          <span class="link-icon"><i data-lucide="${linkPaperMode ? 'link' : 'paperclip'}"></i></span>
        </button>
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
      const clusterLabel = clusterLabels[paper.cluster] || `C${paper.cluster}`;
      html += `
        <div class="connected-paper-item">
          <div class="connected-paper-info">
            <div class="connected-paper-title">${escapeHtml(paper.title)}</div>
            <div class="connected-paper-meta">
              ${paper.year || ''} · ${clusterLabel}
            </div>
          </div>
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

  document.getElementById('toggleLinkMode').addEventListener('click', toggleLinkPaperMode);
  document.getElementById('deleteIdeaBtn').addEventListener('click', () => confirmDeleteIdea(idea));

  container.querySelectorAll('.btn-remove-paper').forEach(btn => {
    btn.addEventListener('click', async () => {
      const paperKey = btn.dataset.paperKey;
      await removePaperFromIdea(idea.zotero_key, paperKey);
      renderIdeaDetail(idea);
      highlightIdeaPapers(idea);
    });
  });
}

// ============================================================
// Idea Operations
// ============================================================

function selectIdea(idea) {
  selectedIdea = idea;
  renderIdeasPanel();
  renderIdeaDetail(idea);
  highlightIdeaPapers(idea);
}

async function saveIdeaField(zoteroKey, field, value) {
  const idea = allIdeas.find(i => i.zotero_key === zoteroKey);
  if (!idea) return;

  idea[field] = value;
  const success = await updateIdea(zoteroKey, { [field]: value });

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

function toggleLinkPaperMode() {
  linkPaperMode = !linkPaperMode;
  const btn = document.getElementById('toggleLinkMode');
  if (btn) {
    btn.querySelector('.link-icon').innerHTML = `<i data-lucide="${linkPaperMode ? 'link' : 'paperclip'}"></i>`;
    btn.classList.toggle('active', linkPaperMode);
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Show indicator on map
  const indicator = document.getElementById('linkModeIndicator');
  if (indicator) {
    indicator.style.display = linkPaperMode ? 'block' : 'none';
  }
}

// Called when clicking a paper on the map while in link mode
async function handlePaperClickForIdea(paper) {
  if (!linkPaperMode || !selectedIdea) return false;

  const connected = selectedIdea.connected_papers || [];
  if (connected.includes(paper.zotero_key)) {
    // Already connected - remove
    await removePaperFromIdea(selectedIdea.zotero_key, paper.zotero_key);
  } else {
    // Add connection
    await addPaperToIdea(selectedIdea.zotero_key, paper.zotero_key);
  }

  renderIdeaDetail(selectedIdea);
  highlightIdeaPapers(selectedIdea);
  return true;  // Indicate we handled the click
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

function initIdeasPanel() {
  // New idea button
  const newBtn = document.getElementById('newIdeaBtn');
  if (newBtn) {
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showNewIdeaDialog();
    });
  }

  // Toggle collapse
  const toggleBtn = document.getElementById('toggleIdeasSection');
  const ideasSection = document.getElementById('ideasSection');
  const header = document.getElementById('ideasSectionHeader');

  if (toggleBtn && ideasSection) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ideasSection.classList.toggle('collapsed');
    });
  }

  if (header && ideasSection) {
    header.addEventListener('click', (e) => {
      if (e.target === header || e.target.classList.contains('ideas-section-title')) {
        ideasSection.classList.toggle('collapsed');
      }
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
