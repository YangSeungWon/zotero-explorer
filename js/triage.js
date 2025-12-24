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

    // Filter: has notes but no status-* tag (status-summarized, status-read, status-skimmed, etc.)
    papers = allPapers.filter(p => {
      if (!p.has_notes) return false;
      const tags = (p.tags || '').toLowerCase();
      // Exclude papers with any status- tag
      if (/\bstatus-\w+/.test(tags)) return false;
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
  // Stop TTS when changing papers
  if (isSpeaking) {
    stopTTS();
  }

  // Reset reading mode
  resetReadingMode();

  // Reset scroll position
  noteContent.scrollTop = 0;

  // Hide mobile actions until scrolled
  document.querySelector('.mobile-actions')?.classList.remove('visible');
  document.querySelector('.triage-container')?.classList.remove('actions-visible');

  // Reset collapsed state on mobile
  const paperInfoEl = document.querySelector('.paper-info');
  if (paperInfoEl) {
    paperInfoEl.classList.remove('collapsed');
    mainContent.classList.remove('info-collapsed');
  }

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

  // Initialize reading mode for new paper
  setTimeout(initReadingMode, 100);
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
// Text-to-Speech with Visual Highlighting
// ============================================================

let isSpeaking = false;
let ttsQueue = [];
let currentTTSIndex = 0;
const ttsBtn = document.getElementById('ttsBtn');

function toggleTTS() {
  if (isSpeaking) {
    stopTTS();
  } else {
    startTTS();
  }
}

// Detect if text contains Korean characters
function hasKorean(text) {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

function getVoiceForLang(lang) {
  const voices = window.speechSynthesis.getVoices();
  if (lang === 'ko') {
    return voices.find(v => v.lang === 'ko-KR')
      || voices.find(v => v.lang.startsWith('ko'));
  } else {
    return voices.find(v => v.lang === 'en-US')
      || voices.find(v => v.lang.startsWith('en'));
  }
}

function startTTS() {
  if (!('speechSynthesis' in window)) {
    showToast('TTS not supported', 'error');
    return;
  }

  window.speechSynthesis.cancel();

  // Get all text blocks (paragraphs, list items)
  const blocks = noteContent.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
  if (blocks.length === 0) {
    // Fallback: treat whole content as one block
    const text = noteContent.innerText.trim();
    if (!text || text === 'No notes available') {
      showToast('No notes to read', 'error');
      return;
    }
    ttsQueue = [{ element: noteContent, text }];
  } else {
    ttsQueue = Array.from(blocks)
      .map(el => ({ element: el, text: el.innerText.trim() }))
      .filter(b => b.text.length > 0);
  }

  if (ttsQueue.length === 0) {
    showToast('No notes to read', 'error');
    return;
  }

  // Start from selected paragraph if any
  if (currentReadingIndex >= 0 && currentReadingIndex < ttsQueue.length) {
    currentTTSIndex = currentReadingIndex;
  } else {
    currentTTSIndex = 0;
  }
  isSpeaking = true;
  ttsBtn.classList.add('playing');
  ttsBtn.querySelector('span').textContent = 'Stop';
  noteContent.classList.add('tts-active');

  speakNext();
}

function speakNext() {
  if (!isSpeaking || currentTTSIndex >= ttsQueue.length) {
    stopTTS();
    return;
  }

  const current = ttsQueue[currentTTSIndex];
  const text = current.text;

  // Highlight current block
  ttsQueue.forEach((b, i) => {
    b.element.classList.remove('tts-current', 'tts-done');
    if (i < currentTTSIndex) {
      b.element.classList.add('tts-done');
    } else if (i === currentTTSIndex) {
      b.element.classList.add('tts-current');
      // Scroll into view
      b.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Detect language and select voice
  const lang = hasKorean(text) ? 'ko' : 'en';
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'ko' ? 'ko-KR' : 'en-US';

  // Use saved voice settings
  const voices = window.speechSynthesis.getVoices();
  let voice = null;
  if (lang === 'ko' && selectedKoVoice) {
    voice = voices.find(v => v.name === selectedKoVoice);
  } else if (lang === 'en' && selectedEnVoice) {
    voice = voices.find(v => v.name === selectedEnVoice);
  }
  if (!voice) {
    voice = getVoiceForLang(lang);
  }
  if (voice) {
    utterance.voice = voice;
  }

  utterance.rate = ttsRate;
  utterance.pitch = 1;

  utterance.onend = () => {
    current.element.classList.remove('tts-current');
    current.element.classList.add('tts-done');
    currentTTSIndex++;
    speakNext();
  };

  utterance.onerror = () => {
    currentTTSIndex++;
    speakNext();
  };

  window.speechSynthesis.speak(utterance);
}

function stopTTS() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  ttsBtn.classList.remove('playing');
  ttsBtn.querySelector('span').textContent = 'Read';

  // Clear all highlights
  noteContent.classList.remove('tts-active');
  ttsQueue.forEach(b => {
    b.element.classList.remove('tts-current', 'tts-done');
  });
  ttsQueue = [];
  currentTTSIndex = 0;
}

// ============================================================
// TTS Settings
// ============================================================

const ttsModal = document.getElementById('ttsModal');
const ttsKoVoiceSelect = document.getElementById('ttsKoVoice');
const ttsEnVoiceSelect = document.getElementById('ttsEnVoice');
const ttsRateSlider = document.getElementById('ttsRate');
const ttsRateValue = document.getElementById('ttsRateValue');
const ttsStatus = document.getElementById('ttsStatus');

let ttsRate = parseFloat(localStorage.getItem('tts_rate') || '1.0');
let selectedKoVoice = localStorage.getItem('tts_ko_voice') || '';
let selectedEnVoice = localStorage.getItem('tts_en_voice') || '';

function showTTSSettings() {
  ttsModal.style.display = 'flex';
  populateVoices();
  ttsRateSlider.value = ttsRate;
  ttsRateValue.textContent = ttsRate.toFixed(1);
  checkTTSStatus();
}

function hideTTSSettings() {
  ttsModal.style.display = 'none';
}

function populateVoices() {
  const voices = window.speechSynthesis.getVoices();

  // Korean voices
  ttsKoVoiceSelect.innerHTML = '<option value="">Auto</option>';
  voices.filter(v => v.lang.startsWith('ko')).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.name === selectedKoVoice) opt.selected = true;
    ttsKoVoiceSelect.appendChild(opt);
  });

  // English voices
  ttsEnVoiceSelect.innerHTML = '<option value="">Auto</option>';
  voices.filter(v => v.lang.startsWith('en')).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.name === selectedEnVoice) opt.selected = true;
    ttsEnVoiceSelect.appendChild(opt);
  });
}

function checkTTSStatus() {
  if (!('speechSynthesis' in window)) {
    ttsStatus.textContent = 'TTS not supported in this browser';
    ttsStatus.className = 'tts-status error';
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  const koVoices = voices.filter(v => v.lang.startsWith('ko'));
  const enVoices = voices.filter(v => v.lang.startsWith('en'));

  let status = `Total: ${voices.length} voices\n`;
  status += `Korean: ${koVoices.length} (${koVoices.map(v => v.name).join(', ') || 'none'})\n`;
  status += `English: ${enVoices.length}`;

  ttsStatus.textContent = status;
  ttsStatus.className = koVoices.length > 0 ? 'tts-status success' : 'tts-status error';
}

function testTTS() {
  window.speechSynthesis.cancel();

  const testText = '안녕하세요. Hello, this is a test.';
  const utterance = new SpeechSynthesisUtterance(testText);
  utterance.rate = ttsRate;

  // Try Korean voice first
  const voices = window.speechSynthesis.getVoices();
  const koVoice = selectedKoVoice
    ? voices.find(v => v.name === selectedKoVoice)
    : voices.find(v => v.lang.startsWith('ko'));

  if (koVoice) {
    utterance.voice = koVoice;
    utterance.lang = 'ko-KR';
  }

  window.speechSynthesis.speak(utterance);
}

// Save settings on change
ttsKoVoiceSelect?.addEventListener('change', () => {
  selectedKoVoice = ttsKoVoiceSelect.value;
  localStorage.setItem('tts_ko_voice', selectedKoVoice);
});

ttsEnVoiceSelect?.addEventListener('change', () => {
  selectedEnVoice = ttsEnVoiceSelect.value;
  localStorage.setItem('tts_en_voice', selectedEnVoice);
});

ttsRateSlider?.addEventListener('input', () => {
  ttsRate = parseFloat(ttsRateSlider.value);
  ttsRateValue.textContent = ttsRate.toFixed(1);
  localStorage.setItem('tts_rate', ttsRate.toString());
});

// Preload voices
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
    if (ttsModal.style.display === 'flex') {
      populateVoices();
      checkTTSStatus();
    }
  };
}

// ============================================================
// Manual Reading Mode (Click + J/K navigation)
// ============================================================

let readingBlocks = [];
let currentReadingIndex = -1;

function initReadingMode() {
  readingBlocks = Array.from(noteContent.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6'))
    .filter(el => el.innerText.trim().length > 0);

  // Add click handlers to each block
  readingBlocks.forEach((block, index) => {
    block.style.cursor = 'pointer';
    block.addEventListener('click', (e) => {
      if (isSpeaking) return; // Don't interfere with TTS
      setReadingIndex(index);
    });
  });
}

function setReadingIndex(index) {
  if (readingBlocks.length === 0) return;

  // Clamp index
  index = Math.max(-1, Math.min(index, readingBlocks.length - 1));
  currentReadingIndex = index;

  // Update highlights
  readingBlocks.forEach((block, i) => {
    block.classList.remove('read-current', 'read-done');
    if (index >= 0) {
      if (i < index) {
        block.classList.add('read-done');
      } else if (i === index) {
        block.classList.add('read-current');
      }
    }
  });

  // Scroll current into view
  if (index >= 0 && readingBlocks[index]) {
    readingBlocks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function nextReadingBlock() {
  if (isSpeaking) return;
  if (readingBlocks.length === 0) initReadingMode();
  setReadingIndex(currentReadingIndex + 1);
}

function prevReadingBlock() {
  if (isSpeaking) return;
  if (readingBlocks.length === 0) initReadingMode();
  setReadingIndex(currentReadingIndex - 1);
}

function resetReadingMode() {
  currentReadingIndex = -1;
  readingBlocks.forEach(block => {
    block.classList.remove('read-current', 'read-done');
  });
  readingBlocks = [];
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

// TTS button
ttsBtn.addEventListener('click', toggleTTS);

// TTS Settings
document.getElementById('ttsSettingsBtn').addEventListener('click', showTTSSettings);
document.getElementById('ttsCloseBtn').addEventListener('click', hideTTSSettings);
document.getElementById('ttsTestBtn').addEventListener('click', testTTS);
ttsModal.addEventListener('click', (e) => {
  if (e.target === ttsModal) hideTTSSettings();
});

// Mobile: toggle paper info collapse
const paperInfo = document.querySelector('.paper-info');
let lastScrollTop = 0;

paperInfo.addEventListener('click', (e) => {
  // Only on mobile
  if (window.innerWidth > 768) return;

  paperInfo.classList.toggle('collapsed');
  mainContent.classList.toggle('info-collapsed');
});

// Auto-collapse on scroll down, expand on scroll to top
// Also show/hide mobile action buttons based on scroll
const mobileActions = document.querySelector('.mobile-actions');

noteContent.addEventListener('scroll', () => {
  if (window.innerWidth > 768) return;

  const scrollTop = noteContent.scrollTop;
  const scrollHeight = noteContent.scrollHeight;
  const clientHeight = noteContent.clientHeight;

  // Paper info collapse/expand
  if (scrollTop > 50 && scrollTop > lastScrollTop) {
    // Scrolling down - collapse
    paperInfo.classList.add('collapsed');
    mainContent.classList.add('info-collapsed');
  } else if (scrollTop <= 10) {
    // At top - expand
    paperInfo.classList.remove('collapsed');
    mainContent.classList.remove('info-collapsed');
  }

  // Show action buttons when scrolled near bottom (90%)
  const scrollPercent = (scrollTop + clientHeight) / scrollHeight;
  const container = document.querySelector('.triage-container');
  if (scrollPercent > 0.9 || scrollHeight <= clientHeight) {
    mobileActions?.classList.add('visible');
    container?.classList.add('actions-visible');
  } else {
    mobileActions?.classList.remove('visible');
    container?.classList.remove('actions-visible');
  }

  lastScrollTop = scrollTop;
});
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

// Keyboard shortcuts (using e.code for layout-independent physical keys)
document.addEventListener('keydown', (e) => {
  // Don't trigger if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Numbers work the same in all layouts
  switch (e.key) {
    case '1':
      setImpact('high');
      return;
    case '2':
      setImpact('mid');
      return;
    case '3':
      setImpact('low');
      return;
    case 'ArrowLeft':
      previous();
      return;
  }

  // Use physical key position for letters (works with Colemak, Dvorak, etc.)
  switch (e.code) {
    case 'KeyN':
      skip();
      break;
    case 'KeyT':
      toggleTTS();
      break;
    case 'KeyJ':
      prevReadingBlock();
      break;
    case 'KeyK':
      nextReadingBlock();
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
