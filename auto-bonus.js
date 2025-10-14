(() => {
  const run = () => {
    const check = () => document.querySelector('.claimable-bonus__icon')?.click();
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
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


