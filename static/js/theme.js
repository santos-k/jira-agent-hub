// Modern Dark/Light mode toggle for Bootstrap 5.3+
// Uses data-bs-theme attribute and localStorage to persist theme

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
  
  let previousTheme = null;

  function setTheme(mode, animated = true) {
    if (!previousTheme) previousTheme = localStorage.getItem('theme') || getSystemTheme();

    // Add animation classes if requested
    if (animated && themeBtn) {
      themeBtn.classList.add('switching');
      themeIcon.classList.add('rotating');
      
      // Remove animation classes after animation completes
      setTimeout(() => {
        themeBtn.classList.remove('switching');
        themeIcon.classList.remove('rotating');
      }, 600);
    }

    // Use Bootstrap 5.3+ data-bs-theme attribute
    document.documentElement.setAttribute('data-bs-theme', mode);
    
    if (mode === 'dark') {
      themeIcon.className = 'bi bi-sun theme-icon rotating';
      // Add dark mode classes for better compatibility
      document.body.classList.add('bg-dark');
      document.body.classList.remove('bg-light');
    } else {
      themeIcon.className = 'bi bi-moon theme-icon rotating';
      // Add light mode classes
      document.body.classList.add('bg-light');
      document.body.classList.remove('bg-dark');
    }
    
    localStorage.setItem('theme', mode);

    // Log the theme change
    sendUIEvent({ category: 'ui', event: 'theme_toggle', label: mode, extra: { from: previousTheme, to: mode } });
    previousTheme = mode;
    
    // Dispatch custom event for other components that might need to react to theme changes
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: mode } }));
  }

  // Detect system theme preference
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // On load, apply saved theme or system theme
  const savedTheme = localStorage.getItem('theme');
  const initialTheme = savedTheme || getSystemTheme();
  setTheme(initialTheme, false); // No animation on initial load

  // Log initial theme state
  sendUIEvent({ category: 'ui', event: 'theme_init', label: initialTheme });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      setTheme(e.matches ? 'dark' : 'light', false); // No animation for system changes
    }
  });

  themeBtn.addEventListener('click', function () {
    const current = localStorage.getItem('theme') === 'dark' ? 'light' : 'dark';
    setTheme(current, true); // With animation for user clicks
  });
});
