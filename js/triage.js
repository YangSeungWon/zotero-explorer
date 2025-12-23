/* ===========================================
   Triage Mode - Paper Impact Classification
   =========================================== */

const API_BASE = '/api';

// State
let papers = [];
let currentIndex = 0;
let apiKey = '';

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const mainContent = document.getElementById('mainContent');
const emptyState = document.getElementById('emptyState');

const currentIndexEl = document.getElementById('currentIndex');
const totalCountEl = document.getElementById('totalCount');
const progressFill = document.getElementById('progressFill');

const paperTitle = document.getElementById('paperTitle');
const paperAuthors = document.getElementById('paperAuthors');
const paperVenue = document.getElementById('paperVenue');
const paperYear = document.getElementById('paperYear');
const paperTags = document.getElementById('paperTags');
const noteContent = document.getElementById('noteContent');

// ============================================================
// Authentication
// ============================================================

function getApiKey() {
  return localStorage.getItem('app_api_key') || '';
}

function setApiKey(key) {
  localStorage.setItem('app_api_key', key);
  apiKey = key;
}

async function checkAuth() {
  apiKey = getApiKey();
  if (!apiKey) {
    showLogin();
    return false;
  }

  try {
    const resp = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey }
    });
    if (!resp.ok) {
      showLogin();
      return false;
    }
    hideLogin();
    return true;
  } catch (e) {
    showLogin();
    return false;
  }
}

function showLogin() {
  loginOverlay.style.display = 'flex';
}

function hideLogin() {
  loginOverlay.style.display = 'none';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('loginApiKey').value.trim();
  if (!key) return;

  setApiKey(key);
  const valid = await checkAuth();
  if (valid) {
    await loadPapers();
  } else {
    loginError.textContent = 'Invalid API Key';
    loginError.style.display = 'block';
  }
});

// ============================================================
// Data Loading
// ============================================================

async function loadPapers() {
  try {
    const resp = await fetch('/papers.json');
    const data = await resp.json();
    const allPapers = data.papers || data;

    // Filter: has notes but no status-summarized tag
    papers = allPapers.filter(p => {
      if (!p.has_notes) return false;
      const tags = (p.tags || '').toLowerCase();
      if (tags.includes('status-summarized')) return false;
      return true;
    });

    // Sort by year desc (newest first)
    papers.sort((a, b) => (b.year || 0) - (a.year || 0));

    currentIndex = 0;
    updateProgress();

    if (papers.length === 0) {
      showEmpty();
    } else {
      showPaper(currentIndex);
    }

  } catch (e) {
    console.error('Failed to load papers:', e);
    showToast('Failed to load papers', 'error');
  }
}

// ============================================================
// UI Updates
// ============================================================

function updateProgress() {
  const remaining = papers.length - currentIndex;
  const total = papers.length;
  const done = currentIndex;

  currentIndexEl.textContent = remaining;
  totalCountEl.textContent = total;

  const percent = total > 0 ? (done / total) * 100 : 0;
  progressFill.style.width = percent + '%';
}

function showEmpty() {
  mainContent.style.display = 'none';
  emptyState.style.display = 'flex';
}

function showPaper(index) {
  if (index >= papers.length) {
    showEmpty();
    return;
  }

  mainContent.style.display = 'flex';
  emptyState.style.display = 'none';

  const paper = papers[index];

  paperTitle.textContent = paper.title || 'Untitled';
  paperAuthors.textContent = paper.authors || '';
  paperVenue.textContent = paper.venue || '';
  paperYear.textContent = paper.year || '';

  // Tags
  const tags = (paper.tags || '').split(/[;,]/).map(t => t.trim()).filter(Boolean);
  paperTags.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');

  // Notes
  if (paper.notes) {
    noteContent.innerHTML = paper.notes;
  } else {
    noteContent.innerHTML = '<em>No notes available</em>';
  }

  updateProgress();
  lucide.createIcons();
}

// ============================================================
// Actions
// ============================================================

async function setImpact(level) {
  if (currentIndex >= papers.length) return;

  const paper = papers[currentIndex];
  const impactTag = `impact-${level}`;
  const statusTag = 'status-summarized';

  // Disable buttons during API call
  document.querySelectorAll('.btn-impact').forEach(btn => btn.classList.add('loading'));

  try {
    // Add both tags
    await addTags(paper.zotero_key, [impactTag, statusTag]);

    showToast(`Tagged as impact-${level}`, 'success');

    // Move to next
    currentIndex++;
    showPaper(currentIndex);

  } catch (e) {
    console.error('Failed to add tags:', e);
    showToast('Failed to add tags: ' + e.message, 'error');
  } finally {
    document.querySelectorAll('.btn-impact').forEach(btn => btn.classList.remove('loading'));
  }
}

async function addTags(zoteroKey, tags) {
  const resp = await fetch(`${API_BASE}/tags/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({
      action: 'add',
      tag: tags[0],
      zotero_keys: [zoteroKey]
    })
  });

  if (!resp.ok) {
    throw new Error('Failed to add tag: ' + tags[0]);
  }

  // Add second tag
  if (tags.length > 1) {
    const resp2 = await fetch(`${API_BASE}/tags/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        action: 'add',
        tag: tags[1],
        zotero_keys: [zoteroKey]
      })
    });

    if (!resp2.ok) {
      throw new Error('Failed to add tag: ' + tags[1]);
    }
  }
}

function skip() {
  if (currentIndex < papers.length - 1) {
    currentIndex++;
    showPaper(currentIndex);
  }
}

function previous() {
  if (currentIndex > 0) {
    currentIndex--;
    showPaper(currentIndex);
  }
}

// ============================================================
// Toast Notification
// ============================================================

function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.triage-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `triage-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Show
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Hide after 2s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ============================================================
// Event Listeners
// ============================================================

// Impact buttons
document.querySelectorAll('.btn-impact').forEach(btn => {
  btn.addEventListener('click', () => {
    const impact = btn.dataset.impact;
    setImpact(impact);
  });
});

// Skip button
document.getElementById('skipBtn').addEventListener('click', skip);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Don't trigger if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case '1':
      setImpact('high');
      break;
    case '2':
      setImpact('mid');
      break;
    case '3':
      setImpact('low');
      break;
    case 'n':
    case 'N':
      skip();
      break;
    case 'ArrowLeft':
      previous();
      break;
  }
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  lucide.createIcons();

  const authed = await checkAuth();
  if (authed) {
    await loadPapers();
  }
}

init();
