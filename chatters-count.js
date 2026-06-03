(() => {
  'use strict';

  const BRIDGE_REQUEST = 'tsn-chatters-request';
  const BRIDGE_RESPONSE = 'tsn-chatters-response';
  const MSG_SOURCE_PAGE = 'tsn-chatters-page';
  const MSG_SOURCE_CONTENT = 'tsn-chatters-content';
  let injected = false;

  function isChattersEnabled(settings) {
    return (settings || {}).chattersCountEnabled !== false;
  }

  function replyToPage(requestId, count, error) {
    window.postMessage(
      {
        source: MSG_SOURCE_CONTENT,
        type: BRIDGE_RESPONSE,
        requestId,
        count: count ?? null,
        error: error || null
      },
      '*'
    );
  }

  function sendChattersRequest(channel) {
    return new Promise((resolve, reject) => {
      try {
        const runtime =
          typeof chrome !== 'undefined' && chrome && chrome.runtime
            ? chrome.runtime
            : null;
        if (!runtime?.id || typeof runtime.sendMessage !== 'function') {
          reject(new Error('Extension unavailable'));
          return;
        }
        runtime.sendMessage({ type: 'chatters:count', channel }, (res) => {
          const err =
            chrome.runtime.lastError?.message || (res?.ok === false ? res.error : null);
          if (err) {
            reject(new Error(err));
            return;
          }
          if (res?.count == null || Number.isNaN(Number(res.count))) {
            reject(new Error('Chatters count unavailable'));
            return;
          }
          resolve(Number(res.count));
        });
      } catch (e) {
        reject(new Error(String(e?.message || e)));
      }
    });
  }

  async function handleBridgeRequest(data) {
    const requestId = data?.requestId;
    const channel = data?.channel;
    if (!requestId || !channel) return;

    try {
      const count = await sendChattersRequest(channel);
      replyToPage(requestId, count, null);
    } catch (e) {
      replyToPage(requestId, null, String(e?.message || e));
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source !== MSG_SOURCE_PAGE) return;
    if (event.data.type !== BRIDGE_REQUEST) return;
    handleBridgeRequest(event.data);
  });

  function injectPageScript() {
    if (injected) return;
    if (!chrome?.runtime?.getURL) return;
    injected = true;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('chatters-count.page.js');
    script.type = 'text/javascript';
    script.async = true;
    (document.head || document.documentElement).appendChild(script);
    script.addEventListener('load', () => {
      script.remove();
    });
  }

  function maybeInject() {
    if (!chrome?.storage?.local?.get) return;
    chrome.storage.local.get(['tsn_settings'], (obj) => {
      if (chrome.runtime.lastError) return;
      if (isChattersEnabled(obj?.tsn_settings)) {
        injectPageScript();
      }
    });
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.tsn_settings) return;
      if (isChattersEnabled(changes.tsn_settings.newValue)) {
        injectPageScript();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeInject);
  } else {
    maybeInject();
  }
})();
