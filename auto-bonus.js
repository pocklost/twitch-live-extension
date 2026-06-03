(() => {
  const POLL_MS = 4000;
  const POLL_HIDDEN_MS = 12000;

  const run = () => {
    const check = () => {
      document.querySelector('.claimable-bonus__icon')?.click();
    };

    let intervalMs = POLL_MS;

    const schedule = () => {
      clearInterval(timer);
      intervalMs = document.hidden ? POLL_HIDDEN_MS : POLL_MS;
      timer = setInterval(() => {
        if (document.hidden) return;
        check();
      }, intervalMs);
    };

    let timer;
    check();
    schedule();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        check();
      }
      schedule();
    });
  };

  const startIfEnabled = () => {
    chrome.storage.local.get(['tsn_settings'], (obj) => {
      const s = obj.tsn_settings || {};
      if (s.autoBonusEnabled !== false) run();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startIfEnabled);
  } else {
    startIfEnabled();
  }
})();
