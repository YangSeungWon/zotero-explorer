/* ===========================================
   Theme Handling (shared across all pages)
   =========================================== */

function applyTheme(theme) {
  const html = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  let icon;
  if (theme === 'auto') {
    html.dataset.theme = systemDark.matches ? '' : 'light';
    icon = 'sun-moon';
    if (themeToggle) themeToggle.title = 'Theme: Auto';
  } else if (theme === 'light') {
    html.dataset.theme = 'light';
    icon = 'sun';
    if (themeToggle) themeToggle.title = 'Theme: Light';
  } else {
    html.dataset.theme = '';
    icon = 'moon';
    if (themeToggle) themeToggle.title = 'Theme: Dark';
  }

  if (themeToggle) {
    themeToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const savedTheme = localStorage.getItem('theme') || 'auto';
      let nextTheme;
      if (savedTheme === 'auto') nextTheme = 'dark';
      else if (savedTheme === 'dark') nextTheme = 'light';
      else nextTheme = 'auto';

      localStorage.setItem('theme', nextTheme);
      applyTheme(nextTheme);
    });
  }

  systemDark.addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'auto') {
      applyTheme('auto');
    }
  });

  applyTheme(localStorage.getItem('theme') || 'auto');
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}
