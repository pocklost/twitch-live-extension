const OFFSCREEN_TARGET = 'offscreen-audio';

let hlsInstance = null;
let audioEl = null;
let cachedExtensionIconBlobUrl = null;

function getAudioEl() {
  if (!audioEl) {
    audioEl = document.getElementById('audio');
  }
  return audioEl;
}

function clearMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = 'none';
}

function getLocalizedExtensionName(metadata = {}) {
  let name = '';
  const fromMeta = String(metadata.extensionName || '').trim();
  if (fromMeta) {
    name = fromMeta;
  } else {
    try {
      name = chrome.i18n.getMessage('extensionName') || '';
    } catch (_) {}
  }
  const pipe = name.indexOf('|');
  return pipe === -1 ? name.trim() : name.slice(0, pipe).trim();
}

async function getExtensionIconBlobUrl() {
  if (cachedExtensionIconBlobUrl) return cachedExtensionIconBlobUrl;
  try {
    const response = await fetch(chrome.runtime.getURL('icons/icon128.png'));
    if (!response.ok) return null;
    const blob = await response.blob();
    cachedExtensionIconBlobUrl = URL.createObjectURL(blob);
    return cachedExtensionIconBlobUrl;
  } catch (_) {
    return null;
  }
}

async function buildMediaArtwork(metadata = {}) {
  const artwork = [];
  const imageUrl = String(metadata.artwork || '').trim();
  if (imageUrl) {
    artwork.push({ src: imageUrl, sizes: '256x256', type: 'image/png' });
  }
  const iconBlobUrl = await getExtensionIconBlobUrl();
  if (iconBlobUrl) {
    artwork.push({ src: iconBlobUrl, sizes: '128x128', type: 'image/png' });
  }
  return artwork;
}

async function updateMediaSession(metadata = {}) {
  if (!('mediaSession' in navigator)) return;

  const channel = String(metadata.displayName || metadata.username || 'Twitch').trim();
  const streamTitle = String(metadata.streamTitle || '').trim();
  const extensionName = getLocalizedExtensionName(metadata);
  const title = streamTitle || channel;
  const artist = streamTitle && extensionName
    ? `${channel} · ${extensionName}`
    : (extensionName || channel);
  const artwork = await buildMediaArtwork(metadata);

  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album: extensionName || undefined,
    artwork
  });
  navigator.mediaSession.playbackState = 'playing';
}

function stopPlayback() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  const el = getAudioEl();
  if (el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  clearMediaSession();
}

function waitForAudioPlaying(el, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!el) {
      reject(new Error('audio_element_missing'));
      return;
    }
    if (!el.paused && el.readyState >= 2) {
      resolve();
      return;
    }

    let settled = false;
    const cleanup = () => {
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('canplay', onPlaying);
      el.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onPlaying = () => finish(() => resolve());
    const onError = () => finish(() => reject(new Error('audio_element_error')));
    const timer = setTimeout(() => finish(() => reject(new Error('audio_play_timeout'))), timeoutMs);

    el.addEventListener('playing', onPlaying);
    el.addEventListener('canplay', onPlaying);
    el.addEventListener('error', onError);
  });
}

async function playStream(url, volume = 1, metadata = {}) {
  stopPlayback();
  const el = getAudioEl();
  el.volume = Math.max(0, Math.min(1, Number(volume) || 1));
  await updateMediaSession(metadata);

  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      startLevel: -1,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      }
    });

    const playPromise = waitForAudioPlaying(el);

    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(el);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      el.play().catch((err) => console.error('[offscreen-audio] play failed:', err));
    });
    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      console.error('[offscreen-audio] HLS error:', data);
      if (data?.fatal) {
        chrome.runtime.sendMessage({
          type: 'audio:error',
          error: data?.details || 'hls_error'
        }).catch(() => {});
      }
    });

    await playPromise;
    return;
  }

  if (el.canPlayType('application/vnd.apple.mpegurl')) {
    el.src = url;
    const playPromise = waitForAudioPlaying(el);
    await el.play();
    await playPromise;
    return;
  }

  throw new Error('HLS not supported');
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== OFFSCREEN_TARGET) return;
  (async () => {
    try {
      if (msg.type === 'offscreen:play') {
        await playStream(msg.url, msg.volume, msg.metadata || {});
        sendResponse({ ok: true, playing: true });
      } else if (msg.type === 'offscreen:stop') {
        stopPlayback();
        sendResponse({ ok: true });
      } else if (msg.type === 'offscreen:volume') {
        const el = getAudioEl();
        if (el) el.volume = Math.max(0, Math.min(1, Number(msg.volume) || 0));
        sendResponse({ ok: true });
      } else if (msg.type === 'offscreen:status') {
        const el = getAudioEl();
        sendResponse({
          ok: true,
          playing: !!(el && !el.paused && !el.ended && el.readyState >= 2),
          volume: el?.volume ?? 1
        });
      } else {
        sendResponse({ ok: false, error: 'unknown_command' });
      }
    } catch (err) {
      console.error('[offscreen-audio] command failed:', err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});
