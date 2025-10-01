function t(key, fallback) {
  try {
    const msg = chrome && chrome.i18n && chrome.i18n.getMessage ? chrome.i18n.getMessage(key) : '';
    return msg || fallback;
  } catch (e) {
    return fallback;
  }
}

window.addEventListener('load', function () {
  try { document.body && document.body.focus && document.body.focus(); } catch (e) {}
  document.title = t('authSuccessTitle', 'Authorization Successful - Twitch Live Notifier');
  var titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = t('authSuccessHeading', 'Authorization Successful');
  var messageEl = document.getElementById('message');
  if (messageEl) messageEl.textContent = t('authSuccessMessage', 'Your Twitch account has been authorized successfully');
  var hintEl = document.getElementById('hint');
  if (hintEl) hintEl.textContent = t('enableAutoFollowHint', "Tip: To auto-fetch followed streamers, enable 'Auto Tracking' in Settings");
});


