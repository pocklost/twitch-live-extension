 

 
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
`;

 
const styleSheet = document.createElement('style');
styleSheet.textContent = translationStyles;
document.head.appendChild(styleSheet);

 
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
  maxCacheSize: 100,
  maxTranslatedElements: 50,
  cacheTTL: 600000
};

 
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

 
function getTranslationPrefix(targetLang, customPrefixValue = '') {
  
  if (customPrefixValue && customPrefixValue.trim()) {
    return customPrefixValue.trim();
  }
  
  
  const language = supportedLanguages.find(lang => lang.code === targetLang);
  return language ? language.prefix : '[譯]';
}

 
function buildTranslatorInterface() {
  
  const hiddenContainer = document.createElement('div');
  hiddenContainer.style.display = 'none';
  hiddenContainer.id = 'chat-translator-hidden';

  const languageOptions = supportedLanguages.map(lang => 
    `<option value="${lang.code}">${lang.name}</option>`
  ).join('');

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
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u;
    return emojiRegex.test(text);
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
      const isEmoji = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u.test(char);
      
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
  async translateText(text, targetLang, provider = 'microsoft') {
    const cacheKey = `${text}_${targetLang}_${provider}`;
    if (translatorState.cache.has(cacheKey)) {
      const entry = translatorState.cache.get(cacheKey);
      if (entry && Date.now() - entry.ts <= translatorState.cacheTTL) {
        return entry.v;
      } else {
        translatorState.cache.delete(cacheKey);
      }
    }
    if (translatorState.inflight.has(cacheKey)) {
      return translatorState.inflight.get(cacheKey);
    }

    const p = (async () => {
      try {
      let result;
      
      if (textUtils.hasEmoji(text)) {
        result = await this.translateWithEmojis(text, targetLang, provider);
      } else {
        result = await this.translateSimple(text, targetLang, provider);
      }
      
      if (translatorState.cache.size >= translatorState.maxCacheSize) {
        const firstKey = translatorState.cache.keys().next().value;
        translatorState.cache.delete(firstKey);
      }
      translatorState.cache.set(cacheKey, { v: result, ts: Date.now() });
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
      translatorState.inflight.delete(cacheKey);
    }
    })();
    translatorState.inflight.set(cacheKey, p);
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
    const sep = '\uE000';
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
      const detectedLang = await this.detectLanguageMicrosoft(chunk, token);
      if (detectedLang && this.isSameLanguageCode(detectedLang, targetLang)) {
        return chunk;
      }
      
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
    try {
      const response = await fetch('https://edge.microsoft.com/translate/auth', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Microsoft auth API error: ${response.status} ${response.statusText}`);
      }
      
      const token = await response.text();
      return [token.trim()];
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

  async processMessage(element, targetLang, provider = 'microsoft') {
    const originalText = translatorState.originalTexts.get(element);
    if (!originalText || !element || !element.isConnected || !element.parentNode) {
      return;
    }

    if (!this.shouldTranslate(originalText)) {
      element.textContent = originalText;
      return;
    }

    try {
      const translation = await translationService.translateText(originalText, targetLang, provider);
      
      if (!element || !element.isConnected || !element.parentNode) {
        return;
      }
      
      if (this.shouldShowTranslation(originalText, translation, targetLang)) {
        this.createTranslatedMessage(element, originalText, translation, targetLang);
      } else {
        element.textContent = originalText;
        this.removeTooltip(element);
      }
      
    } catch (error) {
      console.warn('Message translation failed:', error);
      
      if (element && element.parentNode) {
        element.textContent = originalText;
        this.removeTooltip(element);
      }
    }
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
    
    const originalClean = original.replace(/[\p{P}\p{S}]/gu, '').trim();
    const translatedClean = translated.replace(/[\p{P}\p{S}]/gu, '').trim();
    
    if (originalClean === translatedClean) {
      return true;
    }
    
    const originalHasNonAscii = /[^\x00-\x7F]/.test(original);
    const translatedHasNonAscii = /[^\x00-\x7F]/.test(translated);
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
      console.warn('Element is invalid, cannot create translated message');
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
      
  chrome.storage.local.get(['chatTranslationSettings'], (result) => {
      let settings = result.chatTranslationSettings || {};
      
      let needInitDefaults = false;
      if (!('enabled' in settings)) { settings.enabled = false; needInitDefaults = true; }
      if (!('language' in settings)) { settings.language = 'en'; needInitDefaults = true; }
      if (!('customPrefix' in settings)) { settings.customPrefix = ''; needInitDefaults = true; }
      if (needInitDefaults) {
        try { chrome.storage.local.set({ chatTranslationSettings: settings }); } catch (_) {}
      }
        const customPrefix = settings.customPrefix || '';
        
        const prefix = getTranslationPrefix(targetLang, customPrefix);
        element.textContent = `${prefix} ${translation}`;
      });
      
      const oldHandler = element._translationHandler;
      if (oldHandler) {
        element.removeEventListener('mouseenter', oldHandler.mouseenter);
        element.removeEventListener('mouseleave', oldHandler.mouseleave);
      }
      
      const mouseenterHandler = (e) => {
        console.log('Mouse enter on translated message');
        this.showTooltip(e, originalText);
      };
      
      const mouseleaveHandler = () => {
        console.log('Mouse leave on translated message');
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
      
      this.initGlobalHandlers();
      
      if (!document.hasTranslationListeners) {
        document.addEventListener('mousemove', this.globalMouseMoveHandler);
        document.hasTranslationListeners = true;
      }
      
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

  initGlobalHandlers() {
    if (!this.globalMouseMoveHandler) {
      this.globalMouseMoveHandler = (e) => {
        const translatedElement = e.target.closest('.translated-message');
        const tooltip = document.getElementById('translation-tooltip');
        if (!translatedElement && tooltip) {
          if (tooltip.matches(':hover')) {
            return;
          }
          this.hideTooltip();
        }
      };
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
    console.log('Force hiding all tooltips');
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
    
    let originalText = element.textContent;
    
    supportedLanguages.forEach(lang => {
      const prefixPattern = lang.prefix.replace(/[\[\]]/g, '\\$&');
      const regex = new RegExp(`^\\${lang.prefix}\\s*`, 'g');
      originalText = originalText.replace(regex, '');
    });
    element.textContent = originalText;
    element.className = 'text-fragment';
    element.style.position = '';
    element.style.display = '';
    
    console.log('Removed translated element for performance');
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
    
    let originalText = element.textContent;
    
    supportedLanguages.forEach(lang => {
      const regex = new RegExp(`^\\${lang.prefix}\\s*`, 'g');
      originalText = originalText.replace(regex, '');
    });
    element.textContent = originalText;
    element.className = 'text-fragment';
    element.style.position = '';
    element.style.display = '';
  },

  cleanup() {
    translatorState.translatedElements.forEach((data, element) => {
      this.removeTranslatedElement(element);
    });
    
    translatorState.cache.clear();
    translatorState.inflight.clear();
    translatorState.originalTexts.clear();
    translatorState.translatedElements.clear();
    
    if (this.globalMouseMoveHandler) {
      document.removeEventListener('mousemove', this.globalMouseMoveHandler);
    }
    if (document.hasTranslationListeners) {
      document.hasTranslationListeners = false;
    }
    
    this.forceHideAllTooltips();
    
    console.log('Translation system cleaned up');
  }
};

 
const chatMonitor = {
  start() {
    if (translatorState.watcher) return;

    console.log('Starting chat monitor...');
    
    this.waitForChatContainer();
  },
  
  waitForChatContainer() {
    const chatContainer = document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]');
    
    if (chatContainer) {
      console.log('Chat container found, starting monitor...');
      this.setupChatObserver(chatContainer);
      this.processExistingMessages();
    } else {
      console.log('Chat container not found, retrying...');
      setTimeout(() => this.waitForChatContainer(), 1000);
    }
  },
  
  setupChatObserver(chatContainer) {
    translatorState.watcher = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNewMessage(node);
          }
        });
      });
    });

    translatorState.watcher.observe(chatContainer, {
      childList: true,
      subtree: true
    });
    console.log('Chat monitor started successfully');
  },

  stop() {
    if (translatorState.watcher) {
      translatorState.watcher.disconnect();
      translatorState.watcher = null;
    }
    
    messageProcessor.cleanup();
  },

  processExistingMessages() {
    const messages = document.querySelectorAll("span.text-fragment");
    console.log(`Found ${messages.length} existing messages to process`);
    messages.forEach((element) => {
      if (!element.classList.contains('translated-message')) {
        const originalText = element.textContent;
        
        if (!originalText.startsWith('[譯]')) {
          translatorState.originalTexts.set(element, originalText);
          messageProcessor.processMessage(element, translatorState.targetLang, translatorState.provider);
        }
      }
    });
  },

  processNewMessage(node) {
    if (node.matches && node.matches('span.text-fragment')) {
      if (!translatorState.originalTexts.has(node) && !node.classList.contains('translated-message')) {
        const originalText = node.textContent;
        
        if (!originalText.startsWith('[譯]')) {
          translatorState.originalTexts.set(node, originalText);
          messageProcessor.processMessage(node, translatorState.targetLang, translatorState.provider);
        }
      }
      return;
    }
    
    const messageElement = node.querySelector('span.text-fragment');
    if (messageElement && !translatorState.originalTexts.has(messageElement) && !messageElement.classList.contains('translated-message')) {
      const originalText = messageElement.textContent;
      
      if (!originalText.startsWith('[譯]')) {
        translatorState.originalTexts.set(messageElement, originalText);
        messageProcessor.processMessage(messageElement, translatorState.targetLang, translatorState.provider);
      }
    }
    
    const allMessages = node.querySelectorAll('span.text-fragment');
    allMessages.forEach(msg => {
      if (!translatorState.originalTexts.has(msg) && !msg.classList.contains('translated-message')) {
        const originalText = msg.textContent;
        
        if (!originalText.startsWith('[譯]')) {
          translatorState.originalTexts.set(msg, originalText);
          messageProcessor.processMessage(msg, translatorState.targetLang, translatorState.provider);
        }
      }
    });
  }
};

 
const controlSystem = {
  init() {
    const hiddenContainer = buildTranslatorInterface();
    this.setupEventListeners(hiddenContainer);
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
        this.updateTranslationState();
      }
      this.saveSettings();
    });

    if (providerSelector) {
      providerSelector.addEventListener('change', (e) => {
        translatorState.provider = e.target.value;
        if (translatorState.enabled) {
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
      chatMonitor.start();
    } else {
      chatMonitor.stop();
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
  isInitialized: false,
  
  init() {
    this.setupPathWatcher();
    this.setupNavigationListener();
    this.setupVisibilityChangeListener();
  },
  
  setupPathWatcher() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      routeDetector.handleRouteChange();
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      routeDetector.handleRouteChange();
    };
    
    window.addEventListener('popstate', () => {
      routeDetector.handleRouteChange();
    });
  },
  
  setupNavigationListener() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (link && link.href.includes('twitch.tv')) {
        setTimeout(() => {
          routeDetector.handleRouteChange();
        }, 1000);
      }
    });
  },
  
  setupVisibilityChangeListener() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(() => {
          routeDetector.handleRouteChange();
        }, 500);
      }
    });
  },
  
  handleRouteChange() {
    const newPath = window.location.pathname;
    if (newPath !== this.currentPath) {
      console.log('Route changed from', this.currentPath, 'to', newPath);
      this.currentPath = newPath;
      
      this.reinitializeTranslator();
    }
  },
  
  reinitializeTranslator() {
    if (translatorState.watcher) {
      translatorState.watcher.disconnect();
      translatorState.watcher = null;
    }
    
    messageProcessor.cleanup();
    
    setTimeout(() => {
      if (translatorState.enabled === true && this.isChatPage()) {
        console.log('Reinitializing translator for chat page');
        chatMonitor.start();
      }
    }, 2000);
  },
  
  isChatPage() {
    return window.location.pathname.includes('/') && 
           !window.location.pathname.includes('/directory') &&
           !window.location.pathname.includes('/browse') &&
           !window.location.pathname.includes('/following') &&
           !window.location.pathname.includes('/search');
  }
};

 
function initializeChatTranslator() {
  controlSystem.init();
  routeDetector.init();
  
  if (translatorState.enabled === true && routeDetector.isChatPage()) {
    console.log('Chat translator initialized in background mode');
  } else {
    console.log('Not on chat page, waiting for navigation...');
  }
}

 
  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeChatTranslator);
} else {
  initializeChatTranslator();
}

setTimeout(initializeChatTranslator, 2000);

setInterval(() => {
  if (translatorState.enabled === true && routeDetector.isChatPage() && !translatorState.watcher) {
    console.log('Periodic check: Reinitializing translator');
    chatMonitor.start();
  }
}, 5000);

setInterval(() => {
  const now = Date.now();
  const expired = [];
  translatorState.cache.forEach((entry, key) => {
    if (!entry || now - (entry.ts || 0) > translatorState.cacheTTL) {
      expired.push(key);
    }
  });
  expired.forEach(k => translatorState.cache.delete(k));
  
  const tooltip = document.getElementById('translation-tooltip');
  if (tooltip) {
    const translatedElements = document.querySelectorAll('.translated-message');
    let shouldExist = false;
    
    translatedElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const mouseX = window.mouseX || 0;
      const mouseY = window.mouseY || 0;
      
      if (mouseX >= rect.left && mouseX <= rect.right && 
          mouseY >= rect.top && mouseY <= rect.bottom) {
        shouldExist = true;
      }
    });
    
    if (!shouldExist) {
      console.log('Cleaning up orphaned tooltip');
      messageProcessor.forceHideAllTooltips();
    }
  }
}, 1000);

document.addEventListener('mousemove', (e) => {
  window.mouseX = e.clientX;
  window.mouseY = e.clientY;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateTranslationSettings') {
    translatorState.enabled = message.settings.enabled === true;
    translatorState.targetLang = message.settings.language || 'zh-tw';
    translatorState.provider = message.settings.provider || 'microsoft';
    
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
        customPrefixInput.value = message.settings.customPrefix || '';
      }
      
      messageProcessor.updateTranslationState();
      messageProcessor.updateStatus(statusElement);
    }
    
    sendResponse({ ok: true });
  }
});