// Dark/Light mode toggle for Bootstrap
// Uses localStorage to persist theme

document.addEventListener('DOMContentLoaded', function () {
  // Helper to send UI events to the backend
  function sendUIEvent(payload) {
    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/log_event', blob);
      } else {
        fetch('/log_event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      }
    } catch (e) {
      // ignore telemetry failures
      console.debug('sendUIEvent failed', e);
    }
  }

  const themeBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeLink = document.getElementById('bootstrapTheme');
  const darkHref = 'https://cdn.jsdelivr.net/npm/bootstrap-dark-5@1.1.3/dist/css/bootstrap-dark.min.css';
  const lightHref = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';

  let previousTheme = null;

  function setTheme(mode) {
    if (!previousTheme) previousTheme = localStorage.getItem('theme') || getSystemTheme();

    if (mode === 'dark') {
      themeLink.href = darkHref;
      themeIcon.className = 'bi bi-sun';
      document.body.classList.add('bg-dark', 'text-light');
    } else {
      themeLink.href = lightHref;
      themeIcon.className = 'bi bi-moon';
      document.body.classList.remove('bg-dark', 'text-light');
    }
    localStorage.setItem('theme', mode);

    // Log the theme change
    sendUIEvent({ category: 'ui', event: 'theme_toggle', label: mode, extra: { from: previousTheme, to: mode } });
    previousTheme = mode;
  }

  // Detect system theme preference
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // On load, apply saved theme or system theme
  const savedTheme = localStorage.getItem('theme');
  const initialTheme = savedTheme || getSystemTheme();
  setTheme(initialTheme);

  // Log initial theme state
  sendUIEvent({ category: 'ui', event: 'theme_init', label: initialTheme });

  themeBtn.addEventListener('click', function () {
    const current = localStorage.getItem('theme') === 'dark' ? 'light' : 'dark';
    setTheme(current);
  });
});
