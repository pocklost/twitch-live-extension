 

 
const translationStyles = `
  .translated-message {
    position: relative;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .translated-message:hover {
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 2px 4px;
  }
  
  .original-text-tooltip {
    position: fixed;
    background: rgba(0, 0, 0, 0.95);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    max-width: 300px;
    word-wrap: break-word;
    white-space: normal;
    z-index: 999999;
    opacity: 0;
    visibility: hidden;
    transition: all 0.2s ease;
    pointer-events: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-family: inherit;
  }
  
  .translated-message:hover .original-text-tooltip {
    opacity: 1;
    visibility: visible;
  }
  
  .original-text-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.9);
  }

  p[data-a-target="stream-title"][data-tsn-translated="1"],
  [data-a-target="about-panel"] p[data-tsn-translated="1"] {
    white-space: normal;
    line-height: 1.35;
  }

  .tsn-bilingual-translation {
    display: block;
    opacity: 0.88;
    margin-top: 2px;
  }
`;

 
const styleSheet = document.createElement('style');
styleSheet.id = 'chat-translator-styles';
styleSheet.textContent = translationStyles;

 
const translatorState = {
  enabled: false,
  targetLang: 'zh-tw',
  provider: 'microsoft',
  messageStore: new Map(),
  cache: new Map(),
  inflight: new Map(),
  watcher: null,
  originalTexts: new Map(),
  translatedElements: new Map(),
  maxCacheSize: 500,
  maxTranslatedElements: 50,
  maxOriginalTexts: 100,
  cacheTTL: 3600000,
  cacheLoaded: false,
  bootstrapped: false,
  customPrefix: '',
  messageQueue: [],
  queuedElements: new Set(),
  queueProcessing: false,
  mutationDebounceTimer: null,
  pendingMutations: [],
  cleanupInterval: null,
  reinitInterval: null
};

const TRANSLATION_QUEUE_BATCH = 20;
const TRANSLATION_QUEUE_DELAY_MS = 80;
const MUTATION_DEBOUNCE_MS = 350;
const API_BATCH_SIZE = 10;
const API_BATCH_MAX_CHARS = 3000;
const BATCH_TEXT_SEPARATOR = '\uE000';
const CACHE_STORAGE_KEY = 'chatTranslationCache';
const CHAT_CONTAINER_RETRY_MS = 800;
const CHAT_CONTAINER_MAX_RETRIES = 40;
const ROUTE_CHANGE_DEBOUNCE_MS = 200;
const ROUTE_POLL_MS = 3000;
const BODY_OBSERVER_DEBOUNCE_MS = 350;
const CHAT_NAV_OBSERVER_MAX_MS = 20000;

const CHAT_CONTAINER_SELECTORS = [
  '[data-test-selector="chat-scrollable-area__message-container"]',
  '.chat-scrollable-area__message-container',
  '[data-a-target="chat-messages"]',
  'section[data-test-selector="chat-room-component"] [role="log"]'
];

const STREAM_TITLE_SELECTOR = 'p[data-a-target="stream-title"]';
const ABOUT_PANEL_SELECTOR = '[data-a-target="about-panel"], #live-channel-about-panel';
const PAGE_TEXT_RETRY_MS = 800;
const PAGE_TEXT_MAX_RETRIES = 40;
const STREAM_TITLE_RETRY_MS = 500;
const STREAM_TITLE_MAX_RETRIES = 80;
const STREAM_TITLE_CONTENT_POLL_MS = 600;
const STREAM_TITLE_CONTENT_MAX_ATTEMPTS = 60;
const TRANSLATOR_REINIT_MS = 8000;
const CHAT_BACKLOG_TRANSLATE_MAX = 40;
const STREAM_TITLE_PLACEHOLDER_RE = /^(loading|載入|加载|讀取|读取|\.\.\.)$/i;

const EMOJI_REGEX = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u;
const PUNCTUATION_REGEX = /[\p{P}\p{S}]/gu;
const NON_ASCII_REGEX = /[^\x00-\x7F]/;
const PREFIX_BY_LANG = new Map();
const PREFIX_STRIP_REGEXES = [];

 
const supportedLanguages = [
  { code: 'zh-tw', name: '繁體中文', prefix: '[譯]' },
  { code: 'zh-cn', name: '简体中文', prefix: '[译]' },
  { code: 'en', name: 'English', prefix: '[Trans]' },
  { code: 'ja', name: '日本語', prefix: '[訳]' },
  { code: 'ko', name: '한국어', prefix: '[번역]' },
  { code: 'es', name: 'Español', prefix: '[Trad]' },
  { code: 'fr', name: 'Français', prefix: '[Trad]' },
  { code: 'de', name: 'Deutsch', prefix: '[Übers]' },
  { code: 'ru', name: 'Русский', prefix: '[Перев]' },
  { code: 'pt', name: 'Português', prefix: '[Trad]' },
  { code: 'it', name: 'Italiano', prefix: '[Trad]' },
  { code: 'ar', name: 'العربية', prefix: '[ترجمة]' },
  { code: 'hi', name: 'हिन्दी', prefix: '[अनुवाद]' },
  { code: 'th', name: 'ไทย', prefix: '[แปล]' },
  { code: 'vi', name: 'Tiếng Việt', prefix: '[Dịch]' },
  { code: 'id', name: 'Bahasa Indonesia', prefix: '[Terj]' },
  { code: 'ms', name: 'Bahasa Melayu', prefix: '[Terj]' },
  { code: 'tl', name: 'Filipino', prefix: '[Trans]' },
  { code: 'tr', name: 'Türkçe', prefix: '[Çeviri]' },
  { code: 'pl', name: 'Polski', prefix: '[Tłum]' },
  { code: 'nl', name: 'Nederlands', prefix: '[Vert]' },
  { code: 'sv', name: 'Svenska', prefix: '[Övers]' },
  { code: 'da', name: 'Dansk', prefix: '[Oversat]' },
  { code: 'no', name: 'Norsk', prefix: '[Oversatt]' },
  { code: 'fi', name: 'Suomi', prefix: '[Käännös]' },
  { code: 'cs', name: 'Čeština', prefix: '[Překl]' },
  { code: 'hu', name: 'Magyar', prefix: '[Ford]' },
  { code: 'ro', name: 'Română', prefix: '[Trad]' },
  { code: 'bg', name: 'Български', prefix: '[Превод]' },
  { code: 'hr', name: 'Hrvatski', prefix: '[Prijevod]' },
  { code: 'sk', name: 'Slovenčina', prefix: '[Preklad]' },
  { code: 'sl', name: 'Slovenščina', prefix: '[Prevod]' },
  { code: 'et', name: 'Eesti', prefix: '[Tõlge]' },
  { code: 'lv', name: 'Latviešu', prefix: '[Tulkojums]' },
  { code: 'lt', name: 'Lietuvių', prefix: '[Vertimas]' },
  { code: 'el', name: 'Ελληνικά', prefix: '[Μετάφρ]' },
  { code: 'he', name: 'עברית', prefix: '[תרגום]' },
  { code: 'fa', name: 'فارسی', prefix: '[ترجمه]' },
  { code: 'ur', name: 'اردو', prefix: '[ترجمہ]' },
  { code: 'bn', name: 'বাংলা', prefix: '[অনুবাদ]' },
  { code: 'ta', name: 'தமிழ்', prefix: '[மொழிபெயர்ப்பு]' },
  { code: 'te', name: 'తెలుగు', prefix: '[అనువాదం]' },
  { code: 'ml', name: 'മലയാളം', prefix: '[തർജ്ജമ]' },
  { code: 'kn', name: 'ಕನ್ನಡ', prefix: '[ಅನುವಾದ]' },
  { code: 'gu', name: 'ગુજરાતી', prefix: '[અનુવાદ]' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', prefix: '[ਅਨੁਵਾਦ]' },
  { code: 'mr', name: 'मराठी', prefix: '[अनुवाद]' },
  { code: 'ne', name: 'नेपाली', prefix: '[अनुवाद]' },
  { code: 'si', name: 'සිංහල', prefix: '[පරිවර්තනය]' },
  { code: 'my', name: 'မြန်မာ', prefix: '[ဘာသာပြန်ခြင်း]' },
  { code: 'km', name: 'ខ្មែរ', prefix: '[ការបកន្ឮាយ]' },
  { code: 'lo', name: 'ລາວ', prefix: '[ການແປ]' },
  { code: 'ka', name: 'ქართული', prefix: '[თარგმანი]' },
  { code: 'am', name: 'አማርኛ', prefix: '[ትርጉም]' },
  { code: 'sw', name: 'Kiswahili', prefix: '[Ukalima]' },
  { code: 'zu', name: 'isiZulu', prefix: '[Ukuguqulela]' },
  { code: 'af', name: 'Afrikaans', prefix: '[Vertaal]' },
  { code: 'sq', name: 'Shqip', prefix: '[Përkthim]' },
  { code: 'mk', name: 'Македонски', prefix: '[Превод]' },
  { code: 'sr', name: 'Српски', prefix: '[Превод]' },
  { code: 'bs', name: 'Bosanski', prefix: '[Prijevod]' },
  { code: 'uk', name: 'Українська', prefix: '[Переклад]' },
  { code: 'be', name: 'Беларуская', prefix: '[Пераклад]' },
  { code: 'kk', name: 'Қазақ тілі', prefix: '[Аударма]' },
  { code: 'ky', name: 'Кыргызча', prefix: '[Котормо]' },
  { code: 'uz', name: 'Oʻzbekcha', prefix: '[Tarjima]' },
  { code: 'tg', name: 'Тоҷикӣ', prefix: '[Тарҷума]' },
  { code: 'mn', name: 'Монгол', prefix: '[Орчуулга]' },
  { code: 'az', name: 'Azərbaycanca', prefix: '[Tərcümə]' },
  { code: 'ku', name: 'Kurdî', prefix: '[Wergerand]' },
  { code: 'ps', name: 'پښتو', prefix: '[ژباړنه]' },
  { code: 'sd', name: 'سنڌي', prefix: '[ترجمو]' },
  { code: 'so', name: 'Soomaali', prefix: '[Tarjumaad]' }
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

supportedLanguages.forEach((lang) => {
  PREFIX_BY_LANG.set(lang.code, lang.prefix);
  PREFIX_STRIP_REGEXES.push(new RegExp(`^${escapeRegExp(lang.prefix)}\\s*`));
});

function hasTranslationPrefix(text) {
  if (!text) return false;
  for (const regex of PREFIX_STRIP_REGEXES) {
    if (regex.test(text)) return true;
  }
  return false;
}

function getTranslationPrefix(targetLang, customPrefixValue = '') {
  const custom = customPrefixValue || translatorState.customPrefix;
  if (custom && custom.trim()) {
    return custom.trim();
  }
  return PREFIX_BY_LANG.get(targetLang) || '[譯]';
}

function stripTranslationPrefix(text) {
  let result = text;
  for (const regex of PREFIX_STRIP_REGEXES) {
    result = result.replace(regex, '');
  }
  return result;
}

 
function buildTranslatorInterface() {
  
  const hiddenContainer = document.createElement('div');
  hiddenContainer.style.display = 'none';
  hiddenContainer.id = 'chat-translator-hidden';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'chat-translation-toggle';
  
  const providerSelect = document.createElement('select');
  providerSelect.id = 'translationProvider';
  
  const microsoftOption = document.createElement('option');
  microsoftOption.value = 'microsoft';
  microsoftOption.selected = true;
  microsoftOption.textContent = 'Microsoft Translator';
  
  const googleOption = document.createElement('option');
  googleOption.value = 'google';
  googleOption.textContent = 'Google Translate';
  
  providerSelect.appendChild(microsoftOption);
  providerSelect.appendChild(googleOption);
  
  const languageSelect = document.createElement('select');
  languageSelect.id = 'chat-language-selector';
  
  supportedLanguages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    languageSelect.appendChild(option);
  });
  
  const customPrefixInput = document.createElement('input');
  customPrefixInput.type = 'text';
  customPrefixInput.id = 'customPrefix';
  customPrefixInput.placeholder = '[譯]';
  customPrefixInput.maxLength = 20;
  
  const statusDiv = document.createElement('div');
  statusDiv.id = 'chat-translator-status';
  
  hiddenContainer.appendChild(checkbox);
  hiddenContainer.appendChild(providerSelect);
  hiddenContainer.appendChild(languageSelect);
  hiddenContainer.appendChild(customPrefixInput);
  hiddenContainer.appendChild(statusDiv);

  document.body.appendChild(hiddenContainer);
  return hiddenContainer;
}

 
const textUtils = {
  hasEmoji(text) {
    return EMOJI_REGEX.test(text);
  },

  splitText(text, maxLength = 800) {
    if (text.length <= maxLength) return [text];
    
    const parts = [];
    const sentences = text.split(/([.!?]+\s*)/);
    let currentPart = '';
    
    for (const sentence of sentences) {
      if (currentPart.length + sentence.length > maxLength && currentPart.length > 0) {
        parts.push(currentPart.trim());
        currentPart = sentence;
      } else {
        currentPart += sentence;
      }
    }
    
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }
    
    return parts;
  },

  processEmojiText(text) {
    const segments = [];
    let textBuffer = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const isEmoji = EMOJI_REGEX.test(char);
      
      if (isEmoji) {
        if (textBuffer.trim()) {
          segments.push({ type: 'text', content: textBuffer });
          textBuffer = '';
        }
        segments.push({ type: 'emoji', content: char });
      } else {
        textBuffer += char;
      }
    }
    
    if (textBuffer.trim()) {
      segments.push({ type: 'text', content: textBuffer });
    }
    
    return segments;
  }
};

 
const translationService = {
  _msToken: null,
  _msTokenExpiry: 0,
  _cacheSaveTimer: null,

  cacheKey(text, targetLang, provider) {
    return `${provider}\0${targetLang}\0${text}`;
  },

  getCached(text, targetLang, provider) {
    const key = this.cacheKey(text, targetLang, provider);
    const entry = translatorState.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > translatorState.cacheTTL) {
      translatorState.cache.delete(key);
      return null;
    }
        return entry.v;
  },

  setCached(text, targetLang, provider, value) {
    const key = this.cacheKey(text, targetLang, provider);
    if (translatorState.cache.size >= translatorState.maxCacheSize) {
      const firstKey = translatorState.cache.keys().next().value;
      if (firstKey) translatorState.cache.delete(firstKey);
    }
    translatorState.cache.set(key, { v: value, ts: Date.now() });
    this.scheduleCachePersist();
  },

  loadCacheFromStorage() {
    if (translatorState.cacheLoaded) return;
    translatorState.cacheLoaded = true;
    try {
      chrome.storage.local.get([CACHE_STORAGE_KEY], (result) => {
        const entries = result[CACHE_STORAGE_KEY];
        if (!Array.isArray(entries)) return;
        const now = Date.now();
        for (const item of entries) {
          if (!item || item.length !== 2) continue;
          const [key, entry] = item;
          if (entry && now - (entry.ts || 0) <= translatorState.cacheTTL) {
            translatorState.cache.set(key, entry);
          }
        }
      });
    } catch (_) {}
  },

  scheduleCachePersist() {
    if (this._cacheSaveTimer) return;
    this._cacheSaveTimer = setTimeout(() => {
      this._cacheSaveTimer = null;
      try {
        const entries = Array.from(translatorState.cache.entries()).slice(-translatorState.maxCacheSize);
        chrome.storage.local.set({ [CACHE_STORAGE_KEY]: entries });
      } catch (_) {}
    }, 2500);
  },

  splitTextsIntoApiBatches(texts) {
    const batches = [];
    let current = [];
    let charCount = 0;

    for (const text of texts) {
      const nextLen = charCount + text.length + 1;
      if (current.length > 0 && (current.length >= API_BATCH_SIZE || nextLen > API_BATCH_MAX_CHARS)) {
        batches.push(current);
        current = [];
        charCount = 0;
      }
      current.push(text);
      charCount += text.length + 1;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  },

  async translateTexts(texts, targetLang, provider = 'microsoft') {
    this.loadCacheFromStorage();

    const results = new Map();
    const needNetwork = [];
    const needEmoji = [];

    for (const text of texts) {
      if (!text) continue;

      const cached = this.getCached(text, targetLang, provider);
      if (cached !== null) {
        results.set(text, cached);
        continue;
      }

      if (!messageProcessor.shouldTranslate(text)) {
        results.set(text, text);
        this.setCached(text, targetLang, provider, text);
        continue;
      }

      if (textUtils.hasEmoji(text)) {
        needEmoji.push(text);
      } else if (!needNetwork.includes(text)) {
        needNetwork.push(text);
      }
    }

    for (const batch of this.splitTextsIntoApiBatches(needNetwork)) {
      const inflightKey = `batch:${provider}:${targetLang}:${batch.join(BATCH_TEXT_SEPARATOR)}`;
      let translated;

      if (translatorState.inflight.has(inflightKey)) {
        translated = await translatorState.inflight.get(inflightKey);
      } else {
        const request = this.translateBatchTextsSafe(batch, targetLang, provider).finally(() => {
          translatorState.inflight.delete(inflightKey);
        });
        translatorState.inflight.set(inflightKey, request);
        translated = await request;
      }

      batch.forEach((text, index) => {
        const value = translated[index] ?? text;
        this.setCached(text, targetLang, provider, value);
        results.set(text, value);
      });
    }

    for (const text of needEmoji) {
      if (results.has(text)) continue;
      const value = await this.translateText(text, targetLang, provider);
      results.set(text, value);
    }

    return results;
  },

  async translateBatchTexts(texts, targetLang, provider = 'microsoft') {
    if (texts.length === 0) return [];
    if (texts.length === 1) {
      return [await this.translateSimple(texts[0], targetLang, provider)];
    }

    if (provider === 'microsoft') {
      return await this.translateBatchMicrosoft(texts, targetLang);
    }
    return await this.translateBatchGoogleMessages(texts, targetLang);
  },

  async translateBatchTextsSafe(texts, targetLang, provider = 'microsoft') {
    try {
      return await this.translateBatchTexts(texts, targetLang, provider);
    } catch (error) {
      if (texts.length <= 1) {
        return [await this.translateText(texts[0], targetLang, provider)];
      }

      const mid = Math.ceil(texts.length / 2);
      const left = await this.translateBatchTextsSafe(
        texts.slice(0, mid),
        targetLang,
        provider
      );
      const right = await this.translateBatchTextsSafe(
        texts.slice(mid),
        targetLang,
        provider
      );
      return left.concat(right);
    }
  },

  async translateBatchGoogleMessages(texts, targetLang) {
    const joined = texts.join(BATCH_TEXT_SEPARATOR);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(joined)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data || !data[0] || !Array.isArray(data[0])) {
        throw new Error('Invalid translation response format');
      }

      const full = data[0].map((item) => item[0]).join('');
      const parts = full.split(BATCH_TEXT_SEPARATOR);

      if (parts.length === texts.length) {
        return parts;
      }

      return await Promise.all(texts.map((t) => this.translateChunkGoogle(t, targetLang)));
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to translation service');
      }
      throw error;
    }
  },

  async translateText(text, targetLang, provider = 'microsoft', options = {}) {
    const skipCache = options.skipCache === true;
    const cacheKey = this.cacheKey(text, targetLang, provider);
    const inflightKey = skipCache ? `nocache:${cacheKey}` : cacheKey;

    if (!skipCache) {
      const cached = this.getCached(text, targetLang, provider);
      if (cached !== null) {
        return cached;
      }
    }

    if (translatorState.inflight.has(inflightKey)) {
      return translatorState.inflight.get(inflightKey);
    }

    const p = (async () => {
      try {
      let result;
      
      if (textUtils.hasEmoji(text)) {
        result = await this.translateWithEmojis(text, targetLang, provider);
      } else {
        result = await this.translateSimple(text, targetLang, provider);
      }
      
        if (!skipCache) {
          this.setCached(text, targetLang, provider, result);
      }
      return result;
    } catch (error) {
      if (error.message.includes('Network error') || error.message.includes('fetch')) {
        return text;
      }
      if (error.message.includes('timeout')) {
        return text;
      }
      return text;
    } finally {
        translatorState.inflight.delete(inflightKey);
    }
    })();
    translatorState.inflight.set(inflightKey, p);
    return p;
  },

  async translateSimple(text, targetLang, provider = 'microsoft') {
    const chunks = textUtils.splitText(text);
    
    if (chunks.length === 1) {
      return await this.translateChunk(chunks[0], targetLang, provider);
    }
    
    if (provider === 'microsoft') {
      const arr = await this.translateBatchMicrosoft(chunks, targetLang);
      return arr.join('');
    } else {
      const arr = await this.translateBatchGoogle(chunks, targetLang);
      return arr.join('');
    }
  },

  async translateWithEmojis(text, targetLang, provider = 'microsoft') {
    const segments = textUtils.processEmojiText(text);
    let result = '';
    
    for (const segment of segments) {
      if (segment.type === 'emoji') {
        result += segment.content;
      } else {
        const translated = await this.translateChunk(segment.content, targetLang, provider);
        result += translated;
      }
    }
    
    return result;
  },

  async translateChunk(chunk, targetLang, provider = 'microsoft') {
    if (provider === 'microsoft') {
      return await this.translateChunkMicrosoft(chunk, targetLang);
    } else {
      return await this.translateChunkGoogle(chunk, targetLang);
    }
  },

  async translateBatchGoogle(chunks, targetLang) {
    const sep = BATCH_TEXT_SEPARATOR;
    const joined = chunks.join(sep);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(joined)}`;
    try {
      const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data || !data[0] || !Array.isArray(data[0])) {
        throw new Error('Invalid translation response format');
      }
      const full = data[0].map(item => item[0]).join('');
      const parts = full.split(sep);
      if (parts.length === chunks.length) {
        return parts;
      }
      const fallback = await Promise.all(chunks.map(c => this.translateChunkGoogle(c, targetLang)));
      return fallback;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to translation service');
      }
      throw error;
    }
  },

  async translateBatchMicrosoft(chunks, targetLang) {
    const [token] = await this.msAuth();
    const params = { to: targetLang, 'api-version': '3.0' };
    const queryString = new URLSearchParams(params).toString();
    const url = `https://api-edge.cognitive.microsofttranslator.com/translate?${queryString}`;
    const body = chunks.map(t => ({ Text: t }));
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Microsoft Translation API error: ${response.status} ${response.statusText}: ${errorText}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid Microsoft translation response format');
    }
    return data.map(item => (item.translations || []).map(x => x.text).join(' '));
  },

  async translateChunkGoogle(chunk, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || !data[0] || !Array.isArray(data[0])) {
        throw new Error('Invalid translation response format');
      }
      
      return data[0].map(item => item[0]).join('');
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to translation service');
      }
      throw error;
    }
  },

  async translateChunkMicrosoft(chunk, targetLang) {
    try {
      const [token] = await this.msAuth();
      
      const params = {
        to: targetLang,
        'api-version': '3.0'
      };
      
      const queryString = new URLSearchParams(params).toString();
      const url = `https://api-edge.cognitive.microsofttranslator.com/translate?${queryString}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify([{ Text: chunk }]),
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Microsoft API Error Response:', errorText);
        throw new Error(`Microsoft Translation API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data) || !data[0] || !data[0].translations) {
        throw new Error('Invalid Microsoft translation response format');
      }
      
      return data[0].translations.map(item => item.text).join(' ');
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to Microsoft translation service');
      }
      throw error;
    }
  },

  async msAuth() {
    if (this._msToken && Date.now() < this._msTokenExpiry) {
      return [this._msToken];
    }

    try {
      const response = await fetch('https://edge.microsoft.com/translate/auth', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Microsoft auth API error: ${response.status} ${response.statusText}`);
      }
      
      const token = (await response.text()).trim();
      this._msToken = token;
      this._msTokenExpiry = Date.now() + 9 * 60 * 1000;
      return [token];
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Microsoft auth request timeout');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to Microsoft auth service');
      }
      throw error;
    }
  },

  async detectLanguageMicrosoft(text, token) {
    try {
      const url = 'https://api-edge.cognitive.microsofttranslator.com/detect?api-version=3.0';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify([{ Text: text }]),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        console.warn('Language detection failed, using auto-detect');
        return null;
      }
      
      const data = await response.json();
      return data[0]?.language || null;
    } catch (error) {
      console.warn('Language detection error:', error);
      return null;
    }
  },

  isSameLanguageCode(detectedLang, targetLang) {
    const languageMapping = {
      'zh': ['zh-cn', 'zh-tw', 'zh-hans', 'zh-hant'],
      'zh-cn': ['zh', 'zh-cn', 'zh-hans'],
      'zh-tw': ['zh', 'zh-tw', 'zh-hant'],
      'zh-hans': ['zh', 'zh-cn', 'zh-hans'],
      'zh-hant': ['zh', 'zh-tw', 'zh-hant'],
      'en': ['en', 'en-us', 'en-gb'],
      'ja': ['ja', 'ja-jp'],
      'ko': ['ko', 'ko-kr'],
      'es': ['es', 'es-es', 'es-mx'],
      'fr': ['fr', 'fr-fr', 'fr-ca'],
      'de': ['de', 'de-de'],
      'ru': ['ru', 'ru-ru'],
      'pt': ['pt', 'pt-br', 'pt-pt'],
      'it': ['it', 'it-it'],
      'ar': ['ar', 'ar-sa'],
      'hi': ['hi', 'hi-in'],
      'th': ['th', 'th-th'],
      'vi': ['vi', 'vi-vn'],
      'id': ['id', 'id-id'],
      'ms': ['ms', 'ms-my'],
      'tl': ['tl', 'fil'],
      'tr': ['tr', 'tr-tr'],
      'pl': ['pl', 'pl-pl'],
      'nl': ['nl', 'nl-nl'],
      'sv': ['sv', 'sv-se'],
      'da': ['da', 'da-dk'],
      'no': ['no', 'nb', 'nb-no'],
      'fi': ['fi', 'fi-fi'],
      'cs': ['cs', 'cs-cz'],
      'hu': ['hu', 'hu-hu'],
      'ro': ['ro', 'ro-ro'],
      'bg': ['bg', 'bg-bg'],
      'hr': ['hr', 'hr-hr'],
      'sk': ['sk', 'sk-sk'],
      'sl': ['sl', 'sl-si'],
      'et': ['et', 'et-ee'],
      'lv': ['lv', 'lv-lv'],
      'lt': ['lt', 'lt-lt'],
      'el': ['el', 'el-gr'],
      'he': ['he', 'he-il'],
      'fa': ['fa', 'fa-ir'],
      'ur': ['ur', 'ur-pk'],
      'bn': ['bn', 'bn-bd'],
      'ta': ['ta', 'ta-in'],
      'te': ['te', 'te-in'],
      'ml': ['ml', 'ml-in'],
      'kn': ['kn', 'kn-in'],
      'gu': ['gu', 'gu-in'],
      'pa': ['pa', 'pa-in'],
      'mr': ['mr', 'mr-in'],
      'ne': ['ne', 'ne-np'],
      'si': ['si', 'si-lk'],
      'my': ['my', 'my-mm'],
      'km': ['km', 'km-kh'],
      'lo': ['lo', 'lo-la'],
      'ka': ['ka', 'ka-ge'],
      'am': ['am', 'am-et'],
      'sw': ['sw', 'sw-ke'],
      'zu': ['zu', 'zu-za'],
      'af': ['af', 'af-za'],
      'sq': ['sq', 'sq-al'],
      'mk': ['mk', 'mk-mk'],
      'sr': ['sr', 'sr-rs'],
      'bs': ['bs', 'bs-ba'],
      'uk': ['uk', 'uk-ua'],
      'be': ['be', 'be-by'],
      'kk': ['kk', 'kk-kz'],
      'ky': ['ky', 'ky-kg'],
      'uz': ['uz', 'uz-uz'],
      'tg': ['tg', 'tg-tj'],
      'mn': ['mn', 'mn-mn'],
      'az': ['az', 'az-az'],
      'ku': ['ku', 'ku-tr'],
      'ps': ['ps', 'ps-af'],
      'sd': ['sd', 'sd-pk'],
      'so': ['so', 'so-so']
    };
    
    const detectedVariants = languageMapping[detectedLang] || [detectedLang];
    const targetVariants = languageMapping[targetLang] || [targetLang];
    
    return detectedVariants.some(detected => 
      targetVariants.some(target => 
        detected.toLowerCase() === target.toLowerCase()
      )
    );
  },

  generateTraceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

 
const messageProcessor = {
  shouldTranslate(text) {
    const trimmed = text.trim();
    const compact = trimmed.replace(/\s/g, '');
    const isOnlyAsciiLetters = /^[A-Za-z]+$/.test(compact);
    const isShortAsciiWord = isOnlyAsciiLetters && compact.length <= 3;
    return !( /^\d+$/.test(trimmed) ||
              /^!\S+$/.test(trimmed) ||
              isShortAsciiWord );
  },

  applyTranslation(element, originalText, translation, targetLang) {
    if (!element || !element.isConnected || !element.parentNode) {
      return;
    }

    if (this.shouldShowTranslation(originalText, translation, targetLang)) {
      this.createTranslatedMessage(element, originalText, translation, targetLang);
    } else {
      element.textContent = originalText;
      this.removeTooltip(element);
    }
  },

  async processMessages(elements, targetLang, provider = 'microsoft') {
    const items = [];

    for (const element of elements) {
    const originalText = translatorState.originalTexts.get(element);
    if (!originalText || !element || !element.isConnected || !element.parentNode) {
        continue;
    }

    if (!this.shouldTranslate(originalText)) {
      element.textContent = originalText;
        continue;
    }

      items.push({ element, originalText });
    }
      
    if (items.length === 0) {
        return;
      }
      
    try {
      const texts = items.map((item) => item.originalText);
      const translations = await translationService.translateTexts(texts, targetLang, provider);

      for (const { element, originalText } of items) {
        const translation = translations.get(originalText) ?? originalText;
        this.applyTranslation(element, originalText, translation, targetLang);
      }
    } catch (error) {
      console.warn('Batch message translation failed:', error);
      
      for (const { element, originalText } of items) {
      if (element && element.parentNode) {
        element.textContent = originalText;
        this.removeTooltip(element);
        }
      }
    }
  },

  async processMessage(element, targetLang, provider = 'microsoft') {
    await this.processMessages([element], targetLang, provider);
  },

  shouldShowTranslation(originalText, translation, targetLang) {    
    if (!translation || translation.trim() === '') {
      return false;
    }
    
    if (originalText.toLowerCase().trim() === translation.toLowerCase().trim()) {
      return false;
    }
    
    if (this.isSameLanguage(originalText, translation, targetLang)) {
      return false;
    }
    
    return true;
  },

  isSameLanguage(originalText, translation, targetLang) {    
    const original = originalText.toLowerCase().trim();
    const translated = translation.toLowerCase().trim();
    
    if (original === translated) {
      return true;
    }
    
    const originalClean = original.replace(PUNCTUATION_REGEX, '').trim();
    const translatedClean = translated.replace(PUNCTUATION_REGEX, '').trim();
    
    if (originalClean === translatedClean) {
      return true;
    }
    
    const originalHasNonAscii = NON_ASCII_REGEX.test(original);
    const translatedHasNonAscii = NON_ASCII_REGEX.test(translated);
    if (!originalHasNonAscii && !translatedHasNonAscii && original.length > 0) {
      const lengthDiff = Math.abs(original.length - translated.length) / original.length;
      if (lengthDiff < 0.1) {
        return true;
      }
    }
    
    return false;
  },

  createTranslatedMessage(element, originalText, translation, targetLang) {    
    if (!element || !element.parentNode) {
      return;
    }
    
    this.removeTooltip(element);
    
    if (translatorState.translatedElements.size >= translatorState.maxTranslatedElements) {
      const oldestElement = translatorState.translatedElements.keys().next().value;
      this.removeTranslatedElement(oldestElement);
    }
    
    try {      
      element.className = 'translated-message text-fragment';
      element.style.position = 'relative';
      element.style.display = 'inline';
      
      const prefix = getTranslationPrefix(targetLang);
        element.textContent = `${prefix} ${translation}`;
      
      const oldHandler = element._translationHandler;
      if (oldHandler) {
        element.removeEventListener('mouseenter', oldHandler.mouseenter);
        element.removeEventListener('mouseleave', oldHandler.mouseleave);
      }
      
      const mouseenterHandler = (e) => {
        this.showTooltip(e, originalText);
      };
      
      const mouseleaveHandler = () => {
        setTimeout(() => {
          const tooltip = document.getElementById('translation-tooltip');
          if (tooltip) {
            this.hideTooltip();
          }
        }, 100);
      };
      
      element.addEventListener('mouseenter', mouseenterHandler);
      element.addEventListener('mouseleave', mouseleaveHandler);
      
      element._translationHandler = {
        mouseenter: mouseenterHandler,
        mouseleave: mouseleaveHandler
      };
      
      translatorState.originalTexts.set(element, originalText);
      translatorState.translatedElements.set(element, {
        originalText,
        translation,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error creating translated message:', error);
      element.textContent = originalText;
    }
  },

  showTooltip(event, text) {
    this.hideTooltip();
    
    const fullOriginalText = text || '';
    
    const tooltip = document.createElement('div');
    tooltip.id = 'translation-tooltip';
    tooltip.className = 'original-text-tooltip';
    tooltip.textContent = fullOriginalText;
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = (rect.top - 10) + 'px';
    tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
    
    document.body.appendChild(tooltip);
    
    tooltip.style.opacity = '1';
    tooltip.style.visibility = 'visible';
    
    tooltip.addEventListener('mouseenter', () => {
      const el = document.getElementById('translation-tooltip');
      if (el) {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      }
    });
    tooltip.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });
  },

  hideTooltip() {
    const tooltip = document.getElementById('translation-tooltip');
    if (tooltip) {
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
      
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }
  },

  
  forceHideAllTooltips() {
    this.hideTooltip();
    
    const existingTooltips = document.querySelectorAll('.original-text-tooltip');
    existingTooltips.forEach(tooltip => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    });
  },

  removeTranslatedElement(element) {
    if (!element) return;
    
    translatorState.originalTexts.delete(element);
    translatorState.translatedElements.delete(element);
    
    const handler = element._translationHandler;
    if (handler) {
      element.removeEventListener('mouseenter', handler.mouseenter);
      element.removeEventListener('mouseleave', handler.mouseleave);
      delete element._translationHandler;
    }
    
    element.textContent = stripTranslationPrefix(element.textContent);
    element.className = 'text-fragment';
    element.style.position = '';
    element.style.display = '';
  },

  removeTooltip(element) {
    element.classList.remove('translated-message');
    
    this.hideTooltip();
    
    const tooltip = element.querySelector('.original-text-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
    
    const handler = element._translationHandler;
    if (handler) {
      element.removeEventListener('mouseenter', handler.mouseenter);
      element.removeEventListener('mouseleave', handler.mouseleave);
      delete element._translationHandler;
    }
    
    translatorState.originalTexts.delete(element);
    translatorState.translatedElements.delete(element);
    
    element.textContent = stripTranslationPrefix(element.textContent);
    element.className = 'text-fragment';
    element.style.position = '';
    element.style.display = '';
  },

  cleanup() {
    translatorState.translatedElements.forEach((data, element) => {
      this.removeTranslatedElement(element);
    });
    
    translatorState.inflight.clear();
    translatorState.originalTexts.clear();
    translatorState.translatedElements.clear();
    this.forceHideAllTooltips();
  }
};

 
const messageQueue = {
  enqueue(element) {
    if (
      !element ||
      translatorState.queuedElements.has(element) ||
      translatorState.originalTexts.has(element) ||
      element.classList.contains('translated-message')
    ) {
      return;
    }

    const originalText = element.textContent;
    if (!originalText || hasTranslationPrefix(originalText)) {
      return;
    }

    translatorState.originalTexts.set(element, originalText);
    translatorState.queuedElements.add(element);
    translatorState.messageQueue.push(element);
    this.scheduleDrain();
  },

  scheduleDrain() {
    if (document.hidden) return;
    this.drain();
  },

  async drain() {
    if (translatorState.queueProcessing || !translatorState.enabled || document.hidden) {
      return;
    }

    translatorState.queueProcessing = true;

    while (translatorState.enabled && !document.hidden && translatorState.messageQueue.length > 0) {
      const batch = translatorState.messageQueue.splice(0, TRANSLATION_QUEUE_BATCH);
      batch.forEach((el) => translatorState.queuedElements.delete(el));
      await messageProcessor.processMessages(
        batch,
        translatorState.targetLang,
        translatorState.provider
      );

      if (translatorState.messageQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, TRANSLATION_QUEUE_DELAY_MS));
      }
    }

    translatorState.queueProcessing = false;

    if (translatorState.enabled && translatorState.messageQueue.length > 0 && !document.hidden) {
      this.scheduleDrain();
    }
  },

  clear() {
    translatorState.messageQueue.length = 0;
    translatorState.queuedElements.clear();
    translatorState.queueProcessing = false;
  }
};

function titleElementHasRichMarkup(el) {
  if (!el) return false;
  return !!el.querySelector('a, span, div');
}

function stripTitleTranslationMarkup(el) {
  if (!el) return;
  el.querySelectorAll('.tsn-bilingual-translation').forEach((node) => node.remove());
  el.querySelectorAll('br.tsn-bilingual-break').forEach((node) => node.remove());
}

function getLivePlainWithoutTranslation(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  stripTitleTranslationMarkup(clone);
  return (clone.textContent || '').trim();
}

function getElementSourcePlain(el) {
  if (!el) return '';
  const stored = (el.dataset.tsnOriginal || '').trim();
  const stripped = getLivePlainWithoutTranslation(el);
  if (stored) {
    if (!stripped || stored === stripped || stripped.startsWith(stored)) {
      return stored;
    }
  }
  return stripped || stored;
}

function getLiveTitleState(el) {
  if (!el) return { plain: '', html: null };

  const clone = el.cloneNode(true);
  stripTitleTranslationMarkup(clone);
  const plain = (clone.textContent || '').trim();
  const html = titleElementHasRichMarkup(clone) ? clone.innerHTML : null;
  return { plain, html };
}

function isStreamTitleContentReady(plain) {
  const text = String(plain || '').trim();
  if (text.length < 2) return false;
  if (STREAM_TITLE_PLACEHOLDER_RE.test(text)) return false;
  return true;
}

function isTitleTranslationRendered(el) {
  return el?.dataset?.tsnTranslated === '1' && !!el.querySelector('.tsn-bilingual-translation');
}

function isTitleTranslationStale(el) {
  return el?.dataset?.tsnTranslated === '1' && !el.querySelector('.tsn-bilingual-translation');
}

function createBilingualTranslator(options) {
  const {
    findElement,
    readPlainText,
    watchElement,
    preserveMarkup = false,
    skipCache = false,
    isContentReady = null,
    retryMs = PAGE_TEXT_RETRY_MS,
    maxRetries = PAGE_TEXT_MAX_RETRIES,
    skipBodyObserver = false
  } = options;

  return {
    _attachedElement: null,
    _attachedChannel: null,
    _elementObserver: null,
    _bodyObserver: null,
    _bodyObserverDebounceTimer: null,
    _retryCount: 0,
    _translating: false,
    _contentWaitTimer: null,
    _contentWaitAttempts: 0,
    _elementRepairTimer: null,

    escapeHtml(text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    readPlain(el) {
      return readPlainText.call(this, el);
    },

    findElement() {
      return findElement();
    },

    hasReadyContent(plain) {
      return !isContentReady || isContentReady(plain);
    },

    clearContentWait() {
      if (this._contentWaitTimer) {
        clearTimeout(this._contentWaitTimer);
        this._contentWaitTimer = null;
      }
      this._contentWaitAttempts = 0;
    },

    scheduleContentWait(el) {
      if (!isContentReady || !el?.isConnected) return;
      if (this._contentWaitTimer) return;
      if (this._contentWaitAttempts >= STREAM_TITLE_CONTENT_MAX_ATTEMPTS) return;

      this._contentWaitAttempts += 1;
      this._contentWaitTimer = setTimeout(() => {
        this._contentWaitTimer = null;
        if (!translatorState.enabled || !routeDetector.isChatPage()) return;
        if (!el.isConnected) return;

        const live = preserveMarkup
          ? getLiveTitleState(el)
          : { plain: getLivePlainWithoutTranslation(el), html: null };
        if (this.hasReadyContent(live.plain)) {
          this._contentWaitAttempts = 0;
          this.attachToElement(el);
          return;
        }

        this.syncIfSourceChanged(el);
        this.scheduleContentWait(el);
      }, STREAM_TITLE_CONTENT_POLL_MS);
    },

    applyOriginalContent(el, plain, html) {
      if (!el || !plain) return;
      if (preserveMarkup && html) {
        el.innerHTML = html;
      } else {
        el.textContent = plain;
      }
      el.title = plain;
      el.dataset.tsnOriginal = plain;
      if (preserveMarkup && html) {
        el.dataset.tsnOriginalHtml = html;
      } else {
        delete el.dataset.tsnOriginalHtml;
      }
    },

    resetElement(el, { restoreOriginal = true } = {}) {
      if (!el) return;

      const attrTitle = (el.getAttribute('title') || '').trim();
      const stored = el.dataset.tsnOriginal;
      const storedHtml = el.dataset.tsnOriginalHtml;
      const wasTranslated = el.dataset.tsnTranslated === '1';

      delete el.dataset.tsnTranslated;
      delete el.dataset.tsnOriginal;
      delete el.dataset.tsnOriginalHtml;
      delete el.dataset.tsnTranslation;

      if (restoreOriginal && stored != null) {
        this.applyOriginalContent(el, stored, storedHtml || null);
        return;
      }

      if (preserveMarkup) {
        const live = getLiveTitleState(el);
        if (live.plain) {
          this.applyOriginalContent(el, live.plain, live.html);
        }
        return;
      }

      let live = '';
      if (attrTitle && !attrTitle.includes('\n')) {
        live = attrTitle;
      } else if (wasTranslated && el.querySelector('.tsn-bilingual-translation')) {
        live = (el.childNodes[0]?.textContent || stored || '').trim();
      } else {
        live = (el.textContent || stored || '').trim();
      }

      if (live) {
        el.textContent = live;
        el.title = live;
      }
    },

    isTranslationRendered(el) {
      return isTitleTranslationRendered(el);
    },

    isTranslationStale(el) {
      return isTitleTranslationStale(el);
    },

    repairStaleTranslation(el) {
      if (!el?.isConnected || !this.isTranslationStale(el)) return false;

      const stored = (el.dataset.tsnOriginal || '').trim();
      const cachedTranslation = (el.dataset.tsnTranslation || '').trim();
      const live = preserveMarkup ? getLiveTitleState(el) : { plain: stored, html: null };

      if (live.plain && stored && live.plain !== stored) {
        delete el.dataset.tsnTranslated;
        delete el.dataset.tsnTranslation;
        return false;
      }

      if (preserveMarkup && live.html) {
        el.dataset.tsnOriginalHtml = live.html;
      }

      if (
        stored &&
        cachedTranslation &&
        messageProcessor.shouldShowTranslation(stored, cachedTranslation, translatorState.targetLang)
      ) {
        this.renderBilingual(el, stored, cachedTranslation);
        return true;
      }

      delete el.dataset.tsnTranslated;
      delete el.dataset.tsnTranslation;
      this._translating = false;
      if (stored && this.hasReadyContent(stored)) {
        this.translateElement(el);
      }
      return true;
    },

    scheduleElementRepair(el) {
      if (this._elementRepairTimer) {
        clearTimeout(this._elementRepairTimer);
      }
      this._elementRepairTimer = setTimeout(() => {
        this._elementRepairTimer = null;
        if (!el?.isConnected || !translatorState.enabled) return;
        if (this.repairStaleTranslation(el)) return;
        this.syncIfSourceChanged(el);
      }, 80);
    },

    syncIfSourceChanged(el) {
      if (!el?.isConnected || !translatorState.enabled) return false;
      if (this.repairStaleTranslation(el)) return true;

      const live = preserveMarkup
        ? getLiveTitleState(el)
        : { plain: getLivePlainWithoutTranslation(el), html: null };
      const source = live.plain;
      const stored = (el.dataset.tsnOriginal || '').trim();
      if (!source || source === stored) {
        if (this.isTranslationStale(el)) {
          this.repairStaleTranslation(el);
          return true;
        }
        if (isContentReady && source && !this.hasReadyContent(source)) {
          this.scheduleContentWait(el);
        }
        return false;
      }

      if (!this.hasReadyContent(source)) {
        this.scheduleContentWait(el);
        return false;
      }

      delete el.dataset.tsnTranslated;
      delete el.dataset.tsnTranslation;
      this.applyOriginalContent(el, source, live.html);
      this._translating = false;
      this.translateElement(el);
      return true;
    },

    renderBilingual(el, original, translation) {
      if (this._elementObserver) {
        this._elementObserver.disconnect();
        this._elementObserver = null;
      }

      const originalHtml = el.dataset.tsnOriginalHtml;
      if (preserveMarkup && originalHtml) {
        el.innerHTML =
          `${originalHtml}<br class="tsn-bilingual-break">` +
          `<span class="tsn-bilingual-translation">${this.escapeHtml(translation)}</span>`;
      } else {
        el.innerHTML =
          `${this.escapeHtml(original)}<br class="tsn-bilingual-break">` +
          `<span class="tsn-bilingual-translation">${this.escapeHtml(translation)}</span>`;
      }
      el.title = `${original}\n${translation}`;
      el.dataset.tsnOriginal = original;
      el.dataset.tsnTranslation = translation;
      el.dataset.tsnTranslated = '1';

      if (watchElement) {
        watchElement.call(this, el);
      }

      if (preserveMarkup) {
        requestAnimationFrame(() => {
          if (el.isConnected && this.isTranslationStale(el)) {
            this.repairStaleTranslation(el);
          }
        });
      }
    },

    async translateElement(el) {
      if (!el?.isConnected || !translatorState.enabled) return;

      if (
        el.dataset.tsnTranslated === '1' &&
        this.isTranslationRendered(el) &&
        (el.dataset.tsnTranslation || '').trim()
      ) {
        const stored = (el.dataset.tsnOriginal || '').trim();
        const live = getLivePlainWithoutTranslation(el);
        if (!live || live === stored) {
          return;
        }
      }

      const original = getElementSourcePlain(el);
      if (!original) return;

      if (!messageProcessor.shouldTranslate(original)) {
        const html = el.dataset.tsnOriginalHtml || null;
        this.applyOriginalContent(el, original, html);
        delete el.dataset.tsnTranslated;
        return;
      }

      if (!el.dataset.tsnOriginal) {
        el.dataset.tsnOriginal = original;
      }

      if (this._translating) return;
      this._translating = true;

      try {
        const translation = await translationService.translateText(
          original,
          translatorState.targetLang,
          translatorState.provider,
          { skipCache }
        );

        if (!el.isConnected || getElementSourcePlain(el) !== original) {
          return;
        }

        if (!el.isConnected) return;

        if (messageProcessor.shouldShowTranslation(original, translation, translatorState.targetLang)) {
          if (preserveMarkup && el.dataset.tsnOriginalHtml) {
            const live = getLiveTitleState(el);
            if (live.html) el.dataset.tsnOriginalHtml = live.html;
          }
          this.renderBilingual(el, original, translation);
        } else {
          const html = el.dataset.tsnOriginalHtml || null;
          this.applyOriginalContent(el, original, html);
          delete el.dataset.tsnTranslated;
        }
      } catch (_) {
        const html = el.dataset.tsnOriginalHtml || null;
        this.applyOriginalContent(el, original, html);
      } finally {
        this._translating = false;
      }
    },

    stopBodyObserver() {
      if (this._bodyObserverDebounceTimer) {
        clearTimeout(this._bodyObserverDebounceTimer);
        this._bodyObserverDebounceTimer = null;
      }
      if (this._bodyObserver) {
        this._bodyObserver.disconnect();
        this._bodyObserver = null;
      }
    },

    stopObservers() {
      if (this._elementObserver) {
        this._elementObserver.disconnect();
        this._elementObserver = null;
      }
      this.stopBodyObserver();
    },

    attachToElement(el) {
      if (!el?.isConnected) return false;

      const extraTranslations = el.querySelectorAll('.tsn-bilingual-translation');
      if (extraTranslations.length > 1) {
        const stored = (el.dataset.tsnOriginal || getLivePlainWithoutTranslation(el)).trim();
        const cached = (el.dataset.tsnTranslation || '').trim();
        if (stored && cached) {
          this.renderBilingual(el, stored, cached);
          this._attachedElement = el;
          this._attachedChannel = routeDetector.getChannelFromPath();
          return true;
        }
      }

      const channel = routeDetector.getChannelFromPath();
      const live = preserveMarkup
        ? getLiveTitleState(el)
        : { plain: getLivePlainWithoutTranslation(el), html: null };
      const livePlain = live.plain;
      const stored = (el.dataset.tsnOriginal || '').trim();
      const contentReady = this.hasReadyContent(livePlain);

      if (this._attachedElement && this._attachedElement !== el) {
        this.resetElement(this._attachedElement, { restoreOriginal: false });
      } else if (this._attachedElement === el && channel === this._attachedChannel) {
        if (livePlain === stored && this.isTranslationRendered(el)) {
          this.clearContentWait();
          this.stopBodyObserver();
          return true;
        }
        if (this.isTranslationStale(el) && this.repairStaleTranslation(el)) {
          this.clearContentWait();
          this.stopBodyObserver();
          return true;
        }
        if (livePlain === stored && !contentReady) {
          this.scheduleContentWait(el);
          return false;
        }
        if (livePlain === stored && contentReady) {
          // 標題未變：不要重設 innerHTML，避免與 Twitch React 衝突造成譯文一閃即逝
          if (!this.isTranslationRendered(el)) {
            delete el.dataset.tsnTranslated;
            delete el.dataset.tsnTranslation;
            this.translateElement(el);
          }
          this.clearContentWait();
          this.stopBodyObserver();
          return true;
        }
        this.resetElement(el, { restoreOriginal: false });
      }

      this._attachedElement = el;
      this._attachedChannel = channel;
      this._retryCount = 0;

      if (watchElement) {
        watchElement.call(this, el);
      }

      if (!contentReady) {
        this.scheduleContentWait(el);
        return false;
      }

      this.clearContentWait();
      el.dataset.tsnOriginal = livePlain;
      el.title = livePlain;
      if (preserveMarkup && live.html) {
        el.dataset.tsnOriginalHtml = live.html;
      }
      delete el.dataset.tsnTranslated;
      delete el.dataset.tsnTranslation;
      this.translateElement(el);
      this.stopBodyObserver();
      return true;
    },

    watchForElementInDom() {
      if (this._bodyObserver) return;

      this._bodyObserver = new MutationObserver(() => {
        if (this._bodyObserverDebounceTimer) return;
        this._bodyObserverDebounceTimer = setTimeout(() => {
          this._bodyObserverDebounceTimer = null;
          if (!translatorState.enabled || !routeDetector.isChatPage()) return;
          if (this._attachedElement?.isConnected) return;

          const el = findElement();
          if (!el || el === this._attachedElement) return;

          this.attachToElement(el);
        }, BODY_OBSERVER_DEBOUNCE_MS);
      });

      this._bodyObserver.observe(document.body, { childList: true, subtree: true });
    },

    waitForElement() {
      if (!translatorState.enabled || !routeDetector.isChatPage()) return;

      const el = findElement();
      if (el && this.attachToElement(el)) {
        return;
      }

      if (!skipBodyObserver) {
        this.watchForElementInDom();
      }

      if (this._retryCount >= maxRetries) {
        return;
      }

      this._retryCount += 1;
      setTimeout(() => this.waitForElement(), retryMs);
    },

    start() {
      if (!translatorState.enabled || !routeDetector.isChatPage()) return;
      if (!skipBodyObserver) {
        this.watchForElementInDom();
      }
      this.waitForElement();
    },

    stop() {
      this.stopObservers();
      this.clearContentWait();
      if (this._elementRepairTimer) {
        clearTimeout(this._elementRepairTimer);
        this._elementRepairTimer = null;
      }
      if (this._attachedElement) {
        this.resetElement(this._attachedElement, { restoreOriginal: false });
        this._attachedElement = null;
      }
      this._attachedChannel = null;
      this._retryCount = 0;
      this._translating = false;
    },

    restartForNavigation() {
      this.stop();
      this.start();
    }
  };
}

const streamTitleTranslator = createBilingualTranslator({
  preserveMarkup: true,
  skipCache: true,
  isContentReady: isStreamTitleContentReady,
  retryMs: STREAM_TITLE_RETRY_MS,
  maxRetries: STREAM_TITLE_MAX_RETRIES,

  findElement() {
    const nodes = document.querySelectorAll(STREAM_TITLE_SELECTOR);
    for (const node of nodes) {
      if (!node?.isConnected) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return node;
      }
    }
    return null;
  },

  readPlainText(el) {
    if (!el) return '';
    if (el.dataset.tsnTranslated === '1' && el.dataset.tsnOriginal) {
      return el.dataset.tsnOriginal.trim();
    }
    const live = getLiveTitleState(el).plain;
    if (live) return live;
    const attrTitle = (el.getAttribute('title') || '').trim();
    if (attrTitle && !attrTitle.includes('\n')) {
      return attrTitle;
    }
    return '';
  },

  watchElement(el) {
    if (this._elementObserver) {
      this._elementObserver.disconnect();
    }

    this._elementObserver = new MutationObserver(() => {
      if (!translatorState.enabled) return;
      this.scheduleElementRepair(el);
    });

    this._elementObserver.observe(el, {
      attributes: true,
      attributeFilter: ['title'],
      childList: true,
      characterData: true,
      subtree: true
    });
  }
});

const channelAboutTranslator = createBilingualTranslator({
  skipBodyObserver: true,
  findElement() {
    const panel = document.querySelector(ABOUT_PANEL_SELECTOR);
    if (!panel?.isConnected) return null;

    const content = panel.querySelector('.about-section__panel--content') || panel;
    const paragraphs = content.querySelectorAll('p[dir="auto"]');

    for (const p of paragraphs) {
      if (!p?.isConnected) continue;
      if (p.closest('a, .social-media-link')) continue;
      if (p.querySelector('a, svg')) continue;

      const text = getElementSourcePlain(p);
      if (text.length < 8) continue;
      if (/^\d[\d.,]*\s*(万|億|k|m)?\s*(名)?追隨者/i.test(text)) continue;
      if (/^[\d.,]+\s*(followers?|追隨者)/i.test(text)) continue;

      const rect = p.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return p;
      }
    }
    return null;
  },

  readPlainText(el) {
    return getElementSourcePlain(el);
  },

  watchElement(el) {
    if (this._elementObserver) {
      this._elementObserver.disconnect();
    }

    this._elementObserver = new MutationObserver(() => {
      if (!translatorState.enabled) return;
      this.scheduleElementRepair(el);
    });

    this._elementObserver.observe(el, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
});

const pageTextTranslators = {
  start() {
    streamTitleTranslator.start();
    channelAboutTranslator.start();
  },

  stop() {
    streamTitleTranslator.stop();
    channelAboutTranslator.stop();
  },

  restartForNavigation() {
    streamTitleTranslator.restartForNavigation();
    channelAboutTranslator.restartForNavigation();
  },

  waitForAll() {
    streamTitleTranslator.waitForElement();
    channelAboutTranslator.waitForElement();
  },

  findTitleElement() {
    return streamTitleTranslator.findElement();
  },

  findAboutElement() {
    const attached = channelAboutTranslator._attachedElement;
    if (attached?.isConnected && attached.closest(ABOUT_PANEL_SELECTOR)) {
      return attached;
    }
    return channelAboutTranslator.findElement();
  }
};
 
const chatMonitor = {
  _containerRetries: 0,
  _visibilityBound: false,
  _navObserver: null,
  _navObserverDebounceTimer: null,
  _attachedContainer: null,

  findChatContainer() {
    for (const selector of CHAT_CONTAINER_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!node?.isConnected) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return node;
        }
      }
    }
    return null;
  },

  stopNavObserver() {
    if (this._navObserverDebounceTimer) {
      clearTimeout(this._navObserverDebounceTimer);
      this._navObserverDebounceTimer = null;
    }
    if (this._navObserver) {
      this._navObserver.disconnect();
      this._navObserver = null;
    }
  },

  attachToContainer(chatContainer) {
    if (!chatContainer?.isConnected) return false;

    if (this._attachedContainer === chatContainer && translatorState.watcher) {
      this.processExistingMessages();
      messageQueue.scheduleDrain();
      return true;
    }

    if (translatorState.watcher) {
      translatorState.watcher.disconnect();
      translatorState.watcher = null;
    }

    this._attachedContainer = chatContainer;
    this.stopNavObserver();
    this.setupChatObserver(chatContainer);
    this.processExistingMessages();
    messageQueue.scheduleDrain();
    return true;
  },

  resetForNavigation() {
    this.stopNavObserver();
    this._attachedContainer = null;
    this._containerRetries = 0;

    if (translatorState.mutationDebounceTimer) {
      clearTimeout(translatorState.mutationDebounceTimer);
      translatorState.mutationDebounceTimer = null;
    }
    translatorState.pendingMutations = [];

    if (translatorState.watcher) {
      translatorState.watcher.disconnect();
      translatorState.watcher = null;
    }

    messageQueue.clear();
    messageProcessor.cleanup();
  },

  start() {
    this.startMaintenanceTimers();
    this.bindVisibilityHandler();
    this.waitForChatContainer();
    pageTextTranslators.start();
  },

  restartForNavigation() {
    if (!translatorState.enabled) return;
    this.resetForNavigation();
    this.waitForChatContainer();
    pageTextTranslators.restartForNavigation();
  },

  bindVisibilityHandler() {
    if (this._visibilityBound) return;
    this._visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && translatorState.enabled) {
        messageQueue.scheduleDrain();
        if (!translatorState.watcher) {
    this.waitForChatContainer();
        }
        pageTextTranslators.waitForAll();
      }
    });
  },
  
  waitForChatContainer() {
    if (!translatorState.enabled || !routeDetector.isChatPage()) return;

    const chatContainer = this.findChatContainer();
    if (chatContainer && this.attachToContainer(chatContainer)) {
      return;
    }

    this.watchForChatContainer();

    if (this._containerRetries >= CHAT_CONTAINER_MAX_RETRIES) {
      return;
    }

    this._containerRetries += 1;
    setTimeout(() => this.waitForChatContainer(), CHAT_CONTAINER_RETRY_MS);
  },

  watchForChatContainer() {
    if (this._navObserver || !translatorState.enabled || !routeDetector.isChatPage()) return;

    const startedAt = Date.now();
    this._navObserver = new MutationObserver(() => {
      if (this._navObserverDebounceTimer) return;
      this._navObserverDebounceTimer = setTimeout(() => {
        this._navObserverDebounceTimer = null;
        if (!translatorState.enabled) {
          this.stopNavObserver();
          return;
        }

        const container = this.findChatContainer();
        if (container && this.attachToContainer(container)) {
          return;
        }

        if (Date.now() - startedAt > CHAT_NAV_OBSERVER_MAX_MS) {
          this.stopNavObserver();
        }
      }, BODY_OBSERVER_DEBOUNCE_MS);
    });

    this._navObserver.observe(document.body, { childList: true, subtree: true });
  },
  
  setupChatObserver(chatContainer) {
    translatorState.watcher = new MutationObserver((mutations) => {
      translatorState.pendingMutations.push(...mutations);

      if (translatorState.mutationDebounceTimer) {
        clearTimeout(translatorState.mutationDebounceTimer);
      }

      translatorState.mutationDebounceTimer = setTimeout(() => {
        translatorState.mutationDebounceTimer = null;
        const batch = translatorState.pendingMutations;
        translatorState.pendingMutations = [];
        this.handleMutations(batch);
      }, MUTATION_DEBOUNCE_MS);
    });

    translatorState.watcher.observe(chatContainer, {
      childList: true,
      subtree: true
    });
  },

  handleMutations(mutations) {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNewMessage(node);
          }
        });

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const handleElement = (el) => {
            if (!el) return;
            if (el.matches && (el.matches('span.text-fragment') || el.matches('.translated-message'))) {
              messageProcessor.removeTranslatedElement(el);
            }
          };

          handleElement(node);

          if (node.querySelectorAll) {
            const spans = node.querySelectorAll('span.text-fragment, .translated-message');
            spans.forEach((el) => handleElement(el));
          }
        });
      });
  },

  stop() {
    this.resetForNavigation();
    this.stopMaintenanceTimers();
    pageTextTranslators.stop();
  },

  startMaintenanceTimers() {
    if (!translatorState.cleanupInterval) {
      translatorState.cleanupInterval = setInterval(() => {
        if (!translatorState.enabled) return;

        const now = Date.now();
        const expired = [];
        translatorState.cache.forEach((entry, key) => {
          if (!entry || now - (entry.ts || 0) > translatorState.cacheTTL) {
            expired.push(key);
          }
        });
        expired.forEach((k) => translatorState.cache.delete(k));

        const disconnectedElements = [];
        translatorState.originalTexts.forEach((_, el) => {
          if (!el || !el.isConnected) {
            disconnectedElements.push(el);
          }
        });
        disconnectedElements.forEach((el) => {
          translatorState.originalTexts.delete(el);
          translatorState.translatedElements.delete(el);
        });

        while (translatorState.originalTexts.size > translatorState.maxOriginalTexts) {
          const oldest = translatorState.originalTexts.keys().next().value;
          if (!oldest) break;
          messageProcessor.removeTranslatedElement(oldest);
        }
      }, 30000);
    }

    if (!translatorState.reinitInterval) {
      translatorState.reinitInterval = setInterval(() => {
        if (!document.hidden && translatorState.enabled && routeDetector.isChatPage()) {
          const container = chatMonitor.findChatContainer();
          if (!container) {
            if (!translatorState.watcher) {
              chatMonitor.waitForChatContainer();
            }
          } else if (chatMonitor._attachedContainer !== container || !translatorState.watcher) {
            chatMonitor.attachToContainer(container);
          }

          const channel = routeDetector.getChannelFromPath();
          const titleEl = pageTextTranslators.findTitleElement();
          if (titleEl) {
            if (
              titleEl !== streamTitleTranslator._attachedElement ||
              channel !== streamTitleTranslator._attachedChannel
            ) {
              streamTitleTranslator.attachToElement(titleEl);
            } else if (titleEl.dataset.tsnTranslated !== '1') {
              streamTitleTranslator.syncIfSourceChanged(titleEl);
              if (!isStreamTitleContentReady(streamTitleTranslator.readPlain(titleEl))) {
                streamTitleTranslator.scheduleContentWait(titleEl);
              } else {
                streamTitleTranslator.attachToElement(titleEl);
              }
            } else if (streamTitleTranslator.isTranslationStale(titleEl)) {
              streamTitleTranslator.repairStaleTranslation(titleEl);
            }
          } else {
            streamTitleTranslator.waitForElement();
          }
          const aboutEl = pageTextTranslators.findAboutElement();
          if (aboutEl) {
            if (
              aboutEl !== channelAboutTranslator._attachedElement ||
              channel !== channelAboutTranslator._attachedChannel
            ) {
              channelAboutTranslator.attachToElement(aboutEl);
            } else if (channelAboutTranslator.isTranslationStale(aboutEl)) {
              channelAboutTranslator.repairStaleTranslation(aboutEl);
            } else if (aboutEl.dataset.tsnTranslated !== '1') {
              channelAboutTranslator.syncIfSourceChanged(aboutEl);
            }
          }
          if (!titleEl) {
            streamTitleTranslator.waitForElement();
          } else if (!aboutEl) {
            channelAboutTranslator.waitForElement();
          }
        }
      }, TRANSLATOR_REINIT_MS);
    }
  },

  stopMaintenanceTimers() {
    if (translatorState.cleanupInterval) {
      clearInterval(translatorState.cleanupInterval);
      translatorState.cleanupInterval = null;
    }

    if (translatorState.reinitInterval) {
      clearInterval(translatorState.reinitInterval);
      translatorState.reinitInterval = null;
    }
  },

  processExistingMessages() {
    const messages = document.querySelectorAll('span.text-fragment');
    const backlogStart = Math.max(0, messages.length - CHAT_BACKLOG_TRANSLATE_MAX);
    for (let i = backlogStart; i < messages.length; i++) {
      messageQueue.enqueue(messages[i]);
    }
  },

  processNewMessage(node) {
    if (node.matches?.('span.text-fragment')) {
      messageQueue.enqueue(node);
      return;
    }

    const fragments = node.querySelectorAll?.('span.text-fragment');
    if (!fragments?.length) return;
    fragments.forEach((msg) => messageQueue.enqueue(msg));
  }
};

 
const controlSystem = {
  init() {
    appBootstrap.ensureBootstrapped();
    const hiddenContainer = document.getElementById('chat-translator-hidden');
    if (hiddenContainer) {
    this.setupEventListeners(hiddenContainer);
    }
    this.loadSettings();
  },

  setupEventListeners(hiddenContainer) {
    const toggleSwitch = hiddenContainer.querySelector('#chat-translation-toggle');
    const languageSelector = hiddenContainer.querySelector('#chat-language-selector');
    const providerSelector = hiddenContainer.querySelector('#translationProvider');
    const statusElement = hiddenContainer.querySelector('#chat-translator-status');

    toggleSwitch.addEventListener('change', (e) => {
      translatorState.enabled = e.target.checked === true;
      this.updateTranslationState();
      this.updateStatus(statusElement);
    });

    languageSelector.addEventListener('change', (e) => {
      translatorState.targetLang = e.target.value;
      if (translatorState.enabled) {
        pageTextTranslators.restartForNavigation();
        this.updateTranslationState();
      }
      this.saveSettings();
    });

    if (providerSelector) {
      providerSelector.addEventListener('change', (e) => {
        translatorState.provider = e.target.value;
        if (translatorState.enabled) {
          pageTextTranslators.restartForNavigation();
          this.updateTranslationState();
        }
        this.saveSettings();
      });
    }
    
    const customPrefixInput = hiddenContainer.querySelector('#customPrefix');
    if (customPrefixInput) {
      customPrefixInput.addEventListener('input', () => {
        this.saveSettings();
      });
      
      customPrefixInput.addEventListener('blur', (e) => {
        
        if (e.target.value && e.target.value.trim()) {
          const cleanPrefix = e.target.value.replace(/[\[\]]/g, '').trim();
          if (cleanPrefix) {
            e.target.value = `[${cleanPrefix}]`;
          }
        }
        this.saveSettings();
      });
    }

    
  },

  updateTranslationState() {
    if (translatorState.enabled) {
      routeDetector.init();
      routeDetector.currentPath = window.location.pathname;
      routeDetector.currentChannel = routeDetector.getChannelFromPath();
      chatMonitor.start();
      routeDetector.scheduleDelayedTitleSetup();
      routeDetector.scheduleRouteCheck();
    } else {
      chatMonitor.stop();
      routeDetector.teardown();
    }
  },

  updateStatus(statusElement) {
    if (translatorState.enabled) {
      const langName = supportedLanguages.find(l => l.code === translatorState.targetLang)?.name || translatorState.targetLang;
      statusElement.textContent = `Translating to ${langName}`;
      statusElement.className = 'translator-status active';
    } else {
      statusElement.textContent = 'Translation is inactive';
      statusElement.className = 'translator-status inactive';
    }
  },

  saveSettings() {
    const customPrefixInput = document.querySelector('#customPrefix');
    const providerSelector = document.querySelector('#translationProvider');
    let customPrefix = customPrefixInput ? customPrefixInput.value : '';
    let provider = providerSelector ? providerSelector.value : 'microsoft';
    
    
    if (customPrefix && customPrefix.trim()) {
      const cleanPrefix = customPrefix.replace(/[\[\]]/g, '').trim();
      if (cleanPrefix) {
        customPrefix = `[${cleanPrefix}]`;
        
        if (customPrefixInput) {
          customPrefixInput.value = customPrefix;
        }
      }
    }
    
    translatorState.customPrefix = customPrefix;
    
    chrome.storage.local.set({
      chatTranslationSettings: {
        enabled: translatorState.enabled,
        provider: provider,
        language: translatorState.targetLang,
        customPrefix: customPrefix
      }
    });
  },

  loadSettings() {
    chrome.storage.local.get(['chatTranslationSettings'], (result) => {
      const settings = result.chatTranslationSettings || {};
      
      
      translatorState.enabled = settings.enabled === true;
      translatorState.targetLang = settings.language || 'zh-tw';
      translatorState.provider = settings.provider || 'microsoft';
      translatorState.customPrefix = settings.customPrefix || '';
      
      
      const toggleSwitch = document.querySelector('#chat-translation-toggle');
      const languageSelector = document.querySelector('#chat-language-selector');
      const providerSelector = document.querySelector('#translationProvider');
      const statusElement = document.querySelector('#chat-translator-status');
      const customPrefixInput = document.querySelector('#customPrefix');

      if (toggleSwitch && languageSelector) {
        toggleSwitch.checked = translatorState.enabled === true;
        languageSelector.value = translatorState.targetLang;
        
        if (providerSelector) {
          providerSelector.value = translatorState.provider;
        }
        
        if (customPrefixInput) {
          customPrefixInput.value = settings.customPrefix || '';
        }
        
        this.updateTranslationState();
        this.updateStatus(statusElement);
      }
    });
  }
};

 
const routeDetector = {
  currentPath: window.location.pathname,
  currentChannel: null,
  routeChangeTimer: null,
  pathnamePollInterval: null,
  active: false,

  getChannelFromPath(path = window.location.pathname) {
    const segment = path.split('/').filter(Boolean)[0];
    if (!segment) return null;
    const blocked = new Set([
      'directory', 'browse', 'following', 'search', 'videos', 'settings',
      'subscriptions', 'inventory', 'wallet', 'p', 'downloads', 'turbo'
    ]);
    if (blocked.has(segment.toLowerCase())) return null;
    return segment.toLowerCase();
  },
  
  init() {
    if (this.active) return;
    this.active = true;
    this.currentPath = window.location.pathname;
    this.currentChannel = this.getChannelFromPath(this.currentPath);
    this.setupPathWatcher();
    this.setupVisibilityChangeListener();
    this.setupPathnamePolling();
  },

  teardown() {
    if (!this.active) return;
    this.active = false;
    if (this.routeChangeTimer) {
      clearTimeout(this.routeChangeTimer);
      this.routeChangeTimer = null;
    }
    if (this.pathnamePollInterval) {
      clearInterval(this.pathnamePollInterval);
      this.pathnamePollInterval = null;
    }
  },

  setupPathnamePolling() {
    if (this.pathnamePollInterval) return;
    this.pathnamePollInterval = setInterval(() => {
      this.scheduleRouteCheck();
    }, ROUTE_POLL_MS);
  },
  
  setupPathWatcher() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      routeDetector.scheduleRouteCheck();
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      routeDetector.scheduleRouteCheck();
    };
    
    window.addEventListener('popstate', () => {
      routeDetector.scheduleRouteCheck();
    });
  },
  
  setupVisibilityChangeListener() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.scheduleRouteCheck();
      }
    });
  },

  scheduleRouteCheck() {
    if (!this.active) return;

    if (this.routeChangeTimer) {
      clearTimeout(this.routeChangeTimer);
    }
    this.routeChangeTimer = setTimeout(() => {
      this.routeChangeTimer = null;
      this.handleRouteChange();
    }, ROUTE_CHANGE_DEBOUNCE_MS);
  },
  
  handleRouteChange() {
    if (!this.active) return;

    const newPath = window.location.pathname;
    const newChannel = this.getChannelFromPath(newPath);
    const pathChanged = newPath !== this.currentPath;
    const channelChanged = newChannel !== this.currentChannel;

    if (pathChanged || channelChanged) {
      this.currentPath = newPath;
      this.currentChannel = newChannel;
      this.reinitializeTranslator();
    }
  },
  
  scheduleDelayedTitleSetup() {
    if (!translatorState.enabled || !this.isChatPage()) return;

    streamTitleTranslator._attachedChannel = null;
    channelAboutTranslator._attachedChannel = null;

    [500, 2000, 5000].forEach((delay) => {
      setTimeout(() => {
        if (!translatorState.enabled || !this.isChatPage()) return;
        streamTitleTranslator._retryCount = 0;
        channelAboutTranslator._retryCount = 0;
        pageTextTranslators.waitForAll();
      }, delay);
    });
  },

  reinitializeTranslator() {
    if (!translatorState.enabled) return;

    streamTitleTranslator._attachedChannel = null;
    channelAboutTranslator._attachedChannel = null;
    chatMonitor.restartForNavigation();

    if (!this.isChatPage()) {
      chatMonitor.stop();
      return;
    }

    setTimeout(() => {
      if (translatorState.enabled && this.isChatPage()) {
        chatMonitor.waitForChatContainer();
      }
    }, 300);

    this.scheduleDelayedTitleSetup();
  },
  
  isChatPage() {
    const path = window.location.pathname;
    return path.length > 1 &&
           !path.startsWith('/directory') &&
           !path.startsWith('/browse') &&
           !path.startsWith('/following') &&
           !path.startsWith('/search');
  }
};

const appBootstrap = {
  ensureBootstrapped() {
    if (translatorState.bootstrapped) return;
    translatorState.bootstrapped = true;

    if (!document.getElementById('chat-translator-styles')) {
      document.head.appendChild(styleSheet);
    }

    if (!document.getElementById('chat-translator-hidden')) {
      buildTranslatorInterface();
      controlSystem.setupEventListeners(document.getElementById('chat-translator-hidden'));
    }

    translationService.loadCacheFromStorage();
  },

  syncControlUi() {
    const toggleSwitch = document.querySelector('#chat-translation-toggle');
    const languageSelector = document.querySelector('#chat-language-selector');
    const providerSelector = document.querySelector('#translationProvider');
    const customPrefixInput = document.querySelector('#customPrefix');
    const statusElement = document.querySelector('#chat-translator-status');

    if (toggleSwitch) toggleSwitch.checked = translatorState.enabled === true;
    if (languageSelector) languageSelector.value = translatorState.targetLang;
    if (providerSelector) providerSelector.value = translatorState.provider;
    if (customPrefixInput) customPrefixInput.value = translatorState.customPrefix || '';
    if (statusElement) controlSystem.updateStatus(statusElement);
  },

  applySettings(settings) {
    translatorState.enabled = settings.enabled === true;
    translatorState.targetLang = settings.language || 'zh-tw';
    translatorState.provider = settings.provider || 'microsoft';
    translatorState.customPrefix = settings.customPrefix || '';

    if (translatorState.enabled) {
      this.ensureBootstrapped();
      this.syncControlUi();
      controlSystem.updateTranslationState();
    } else {
      controlSystem.updateTranslationState();
    }
  },

  init() {
    chrome.storage.local.get(['chatTranslationSettings'], (result) => {
      this.applySettings(result.chatTranslationSettings || {});
    });
  }
};

function onPageFullyLoaded() {
  if (!translatorState.enabled) return;
  routeDetector.scheduleDelayedTitleSetup();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => appBootstrap.init());
} else {
  appBootstrap.init();
}

if (document.readyState === 'complete') {
  onPageFullyLoaded();
} else {
  window.addEventListener('load', onPageFullyLoaded, { once: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateTranslationSettings') {
    const settings = message.settings || {};
    appBootstrap.applySettings(settings);
    sendResponse({ ok: true });
  }
});