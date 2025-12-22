/* ===========================================
   API Client with Authentication
   =========================================== */

const API_BASE = '/api';

// Get stored API key (set by auth.js after login)
function getApiKey() {
  return localStorage.getItem('app_api_key');
}

// Clear stored API key
function clearApiKey() {
  localStorage.removeItem('app_api_key');
}

// API call with authentication
async function apiCall(endpoint, options = {}) {
  const key = getApiKey();
  if (!key) {
    throw new Error('API key required');
  }

  const url = endpoint.startsWith('/') ? `${API_BASE}${endpoint}` : `${API_BASE}/${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-API-Key': key,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearApiKey();
        throw new Error('Invalid API key. Please try again.');
      }
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (e) {
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      throw new Error('Cannot connect to API server.');
    }
    throw e;
  }
}

// ============================================================
// Tag API Functions
// ============================================================

// Get tags for a paper
async function getTagsForPaper(zoteroKey) {
  return await apiCall(`/tags/paper/${zoteroKey}`, { method: 'GET' });
}

// Update tags for a paper (replace all)
async function updatePaperTags(zoteroKey, tags) {
  return await apiCall(`/tags/paper/${zoteroKey}`, {
    method: 'POST',
    body: JSON.stringify({ tags })
  });
}

// Add tags to a paper (preserve existing)
async function addTagsToPaper(zoteroKey, tags) {
  return await apiCall(`/tags/paper/${zoteroKey}/add`, {
    method: 'POST',
    body: JSON.stringify({ tags })
  });
}

// Batch tag operation
async function batchTagOperation(action, tag, zoteroKeys) {
  return await apiCall('/tags/batch', {
    method: 'POST',
    body: JSON.stringify({
      action,
      tag,
      zotero_keys: zoteroKeys
    })
  });
}

// Sync cluster labels as tags
async function syncClusterTags(prefix, clusterLabels) {
  return await apiCall('/tags/sync-clusters', {
    method: 'POST',
    body: JSON.stringify({
      prefix,
      cluster_labels: clusterLabels
    })
  });
}

// ============================================================
// Helper Functions
// ============================================================

// Batch operation with progress callback
async function batchTagOperationWithProgress(action, tag, zoteroKeys, onProgress) {
  const CHUNK_SIZE = 10;
  const DELAY_MS = 500;
  const results = { success: 0, failed: 0 };

  for (let i = 0; i < zoteroKeys.length; i += CHUNK_SIZE) {
    const chunk = zoteroKeys.slice(i, i + CHUNK_SIZE);

    try {
      const result = await batchTagOperation(action, tag, chunk);
      results.success += result.success || 0;
      results.failed += result.failed || 0;
    } catch (e) {
      results.failed += chunk.length;
    }

    if (onProgress) {
      onProgress(Math.min(i + CHUNK_SIZE, zoteroKeys.length), zoteroKeys.length);
    }

    // Rate limiting delay
    if (i + CHUNK_SIZE < zoteroKeys.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return results;
}

// Update local paper tags in memory
function updateLocalPaperTags(paperId, newTags) {
  const paper = allPapers.find(p => p.id === paperId);
  if (paper) {
    paper.tags = newTags.join(', ');

    // Update allTags set
    newTags.forEach(tag => allTags.add(tag));

    // Refresh tag filter dropdown
    refreshTagFilter();
  }
}

// Refresh tag filter dropdown
function refreshTagFilter() {
  const tagFilter = document.getElementById('tagFilter');
  const mobileTagFilter = document.getElementById('mobileTagFilter');
  const currentValue = tagFilter.value;

  // Clear and rebuild options
  const sortedTags = [...allTags].sort();

  [tagFilter, mobileTagFilter].forEach(el => {
    if (!el) return;
    el.innerHTML = '<option value="">All tags</option>';
    sortedTags.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      el.appendChild(opt);
    });
  });

  // Restore selection
  if (currentValue && allTags.has(currentValue)) {
    tagFilter.value = currentValue;
    if (mobileTagFilter) mobileTagFilter.value = currentValue;
  }
}
