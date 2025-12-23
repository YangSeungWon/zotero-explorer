/* ===========================================
   Triage Mode - Paper Impact Classification
   =========================================== */

const API_BASE = '/api';

// State
let papers = [];
let currentIndex = 0;
let apiKey = '';

// Session Stats State
let sessionCount = 0;
let sessionStartTime = null;
let sessionTimerInterval = null;
let sessionGoal = 10;
let goalCompleted = false;

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

// Stats DOM Elements
const sessionCountEl = document.getElementById('sessionCount');
const sessionTimerEl = document.getElementById('sessionTimer');
const streakCountEl = document.getElementById('streakCount');
const goalTextEl = document.getElementById('goalText');
const goalProgressFill = document.getElementById('goalProgressFill');
const goalModal = document.getElementById('goalModal');
const goalInput = document.getElementById('goalInput');

// ============================================================
// Streak & Stats Management
// ============================================================

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function loadStreak() {
  const lastDate = localStorage.getItem('triage_streak_date');
  const streak = parseInt(localStorage.getItem('triage_streak_count') || '0');
  const today = getTodayKey();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (lastDate === today) {
    // Already reviewed today, keep streak
    return streak;
  } else if (lastDate === yesterday) {
    // Reviewed yesterday, streak continues
    return streak;
  } else if (lastDate) {
    // Streak broken
    return 0;
  }
  return 0;
}

function updateStreak() {
  const lastDate = localStorage.getItem('triage_streak_date');
  const today = getTodayKey();
  let streak = parseInt(localStorage.getItem('triage_streak_count') || '0');

  if (lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (lastDate === yesterday) {
      streak++;
    } else {
      streak = 1;
    }
    localStorage.setItem('triage_streak_date', today);
    localStorage.setItem('triage_streak_count', streak.toString());
  }

  streakCountEl.textContent = streak;
}

function loadTodayCount() {
  const saved = localStorage.getItem('triage_today');
  if (saved) {
    const data = JSON.parse(saved);
    if (data.date === getTodayKey()) {
      return data.count;
    }
  }
  return 0;
}

function saveTodayCount(count) {
  localStorage.setItem('triage_today', JSON.stringify({
    date: getTodayKey(),
    count: count
  }));
}

function loadSessionGoal() {
  return parseInt(localStorage.getItem('triage_session_goal') || '10');
}

function saveSessionGoal(goal) {
  localStorage.setItem('triage_session_goal', goal.toString());
}

// ============================================================
// Session Timer
// ============================================================

function startSessionTimer() {
  sessionStartTime = Date.now();
  sessionTimerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  sessionTimerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================
// Goal Progress
// ============================================================

function updateGoalDisplay() {
  const progress = Math.min(sessionCount / sessionGoal, 1);
  goalProgressFill.style.width = (progress * 100) + '%';
  goalTextEl.textContent = `${sessionCount}/${sessionGoal}`;

  // Check if goal completed
  if (sessionCount >= sessionGoal && !goalCompleted) {
    goalCompleted = true;
    celebrateGoal();
  }
}

function celebrateGoal() {
  showToast('Goal completed!', 'success');

  // Simple confetti effect
  const colors = ['#22c55e', '#eab308', '#3b82f6', '#ec4899'];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.cssText = `
      left: ${Math.random() * 100}vw;
      top: -10px;
      width: 10px;
      height: 10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
      animation: confettiFall ${2 + Math.random() * 2}s linear forwards;
      animation-delay: ${Math.random() * 0.5}s;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
}

function showGoalModal() {
  goalInput.value = sessionGoal;
  goalModal.style.display = 'flex';
  goalInput.focus();
  goalInput.select();
}

function hideGoalModal() {
  goalModal.style.display = 'none';
}

function setGoal(value) {
  sessionGoal = Math.max(1, Math.min(100, parseInt(value) || 10));
  saveSessionGoal(sessionGoal);
  goalCompleted = sessionCount >= sessionGoal;
  updateGoalDisplay();
  hideGoalModal();
}

// ============================================================
// Stats Update
// ============================================================

function incrementSessionCount() {
  sessionCount++;
  sessionCountEl.textContent = sessionCount;

  // Update today's total
  const todayTotal = loadTodayCount() + 1;
  saveTodayCount(todayTotal);

  // Update streak on first review of the day
  if (todayTotal === 1) {
    updateStreak();
  }

  updateGoalDisplay();
}

function initStats() {
  // Load saved goal
  sessionGoal = loadSessionGoal();

  // Load and display streak
  const streak = loadStreak();
  streakCountEl.textContent = streak;

  // Initialize displays
  sessionCountEl.textContent = '0';
  updateGoalDisplay();

  // Start timer
  startSessionTimer();
}

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

  mainContent.style.display = 'grid';
  emptyState.style.display = 'none';

  const paper = papers[index];

  paperTitle.textContent = paper.title || 'Untitled';
  paperAuthors.textContent = paper.authors || '';
  paperVenue.textContent = paper.venue || '';
  paperYear.textContent = paper.year || '';

  // Tags
  const tags = (paper.tags || '').split(/[;,]/).map(t => t.trim()).filter(Boolean);
  paperTags.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');

  // Notes - prefer notes_html (has proper formatting), fall back to notes
  if (paper.notes_html) {
    // Already HTML with proper structure
    noteContent.innerHTML = paper.notes_html;
  } else if (paper.notes) {
    const notes = paper.notes;
    if (typeof marked !== 'undefined') {
      // Plain text/markdown - parse with marked
      noteContent.innerHTML = marked.parse(notes);
    } else {
      // Fallback: simple text with line breaks
      noteContent.innerHTML = notes.replace(/\n/g, '<br>');
    }
  } else {
    noteContent.innerHTML = '<em>No notes available</em>';
  }

  updateProgress();
  lucide.createIcons();
}

// ============================================================
// Actions
// ============================================================

function setImpact(level) {
  if (currentIndex >= papers.length) return;

  const paper = papers[currentIndex];
  const impactTag = `impact-${level}`;
  const statusTag = 'status-summarized';

  // Update stats
  incrementSessionCount();

  // Optimistic UI: move to next immediately
  currentIndex++;
  showPaper(currentIndex);

  // Add tags in background
  addTags(paper.zotero_key, [impactTag, statusTag])
    .catch(e => {
      console.error('Failed to add tags:', e);
      showToast('Failed to add tags: ' + e.message, 'error');
    });
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

// Goal modal
document.getElementById('goalEditBtn').addEventListener('click', showGoalModal);
document.getElementById('goalCancelBtn').addEventListener('click', hideGoalModal);
document.getElementById('goalSaveBtn').addEventListener('click', () => setGoal(goalInput.value));
goalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    setGoal(goalInput.value);
  } else if (e.key === 'Escape') {
    hideGoalModal();
  }
});
goalModal.addEventListener('click', (e) => {
  if (e.target === goalModal) hideGoalModal();
});

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
    initStats();
    await loadPapers();
  }
}

init();
