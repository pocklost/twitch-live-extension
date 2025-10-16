(() => {
  'use strict';
  let injected = false;

  function injectPageScript() {
    if (injected) return;
    injected = true;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('chatters-count.page.js');
    script.type = 'text/javascript';
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.addEventListener('load', () => {
      script.remove();
    });
  }

  function maybeInject() {
    try {
      chrome.storage?.local?.get(['tsn_settings'], (obj) => {
        const s = obj?.tsn_settings || {};
        if (s.chattersCountEnabled === true) {
          injectPageScript();
        }
      });
    } catch (_) {
      injectPageScript();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeInject);
  } else {
    maybeInject();
  }
})();
