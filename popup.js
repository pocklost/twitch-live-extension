function formatViewerCount(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

function formatStreamDuration(startTime) {
  if (!startTime) return chrome.i18n.getMessage('unknown');
  
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now - start;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}${chrome.i18n.getMessage('hours')}${minutes}${chrome.i18n.getMessage('minutes')}`;
  } else {
    return `${minutes}${chrome.i18n.getMessage('minutes')}`;
  }
}

function formatStreamTime(startTime) {
  if (!startTime) return '00:00:00';
  
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now - start;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.getElementById(tabName + 'Content').classList.add('active');
  
  document.getElementById(tabName + 'Tab').classList.add('active');
  
  if (tabName === 'settings') {
  const manualChannelSection = document.getElementById('manualChannelSection');
  const autoTrackingSection = document.getElementById('autoTrackingSection');
  const notificationSettingsSection = document.getElementById('notificationSettingsSection');
  const translationSection = document.getElementById('translationSection');
  const backupSection = document.getElementById('backupSection');
  const settingsStatusBar = document.getElementById('settingsStatusBar');
  if (manualChannelSection) manualChannelSection.style.display = 'none';
  if (autoTrackingSection) autoTrackingSection.style.display = 'none';
  if (notificationSettingsSection) notificationSettingsSection.style.display = 'none';
  if (translationSection) translationSection.style.display = 'none';
  if (backupSection) backupSection.style.display = 'none';
  if (settingsStatusBar) settingsStatusBar.style.display = 'none';

    loadSettings();
    loadChannels();
    checkAuthStatus();
  }
}

function parseChannels(input) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const twitchUrlMatch = s.match(/https?:\/\/(?:www\.)?twitch\.tv\/([^\/\?]+)/i);
      if (twitchUrlMatch) {
        return twitchUrlMatch[1].toLowerCase();
      }
      return s.toLowerCase();
    });
}

function renderChips(channels) {
  const chips = document.getElementById('chips');
  if (!chips) return;
  chips.innerHTML = '';
  (channels || []).forEach((c) => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `${c} <button class="tag-remove" data-channel="${c}">×</button>`;
    chips.appendChild(tag);
  });
  chips.querySelectorAll('.tag-remove').forEach((el) => {
    el.addEventListener('click', () => {
      const toRemove = el.getAttribute('data-channel');
      el.disabled = true;
      chrome.runtime.sendMessage({ type: 'streams:remove', username: toRemove }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
          el.disabled = false;
          return;
        }
        if (response?.ok) {
          renderChips(response.channels || []);
          showStatus(chrome.i18n.getMessage('channelRemoved'), 'success');
        } else {
          const msg = response?.error || chrome.i18n.getMessage('deleteFailed') || 'Delete failed';
          showStatus(`❌ ${msg}`, 'error');
          el.disabled = false;
        }
      });
    });
  });
}

function loadChannels() {
  chrome.runtime.sendMessage({ type: 'streams:list' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error loading channels:', chrome.runtime.lastError.message);
      return;
    }
    if (response?.payload) {
      const channels = response.payload.map(s => s.username).filter(Boolean);
      renderChips(channels);
    }
  });
}

function loadSettings() {
  chrome.runtime.sendMessage({ type: 'settings:get' }, (res) => {
    if (chrome.runtime.lastError) {
      console.log('Error loading settings:', chrome.runtime.lastError.message);
      return;
    }
    const s = res?.settings || {};
    
    const muteNotificationsEl = document.getElementById('muteNotifications');
    const hideOfflineEl = document.getElementById('hideOffline');
    const hidePreviewsEl = document.getElementById('hidePreviews');
    const pollMinutesEl = document.getElementById('pollMinutes');
    const autoFollowEl = document.getElementById('autoFollow');
    const translationEnabledEl = document.getElementById('translationEnabled');
    const targetLanguageEl = document.getElementById('targetLanguage');
    const customPrefixEl = document.getElementById('customPrefix');
    
    if (muteNotificationsEl) muteNotificationsEl.checked = !!s.muteNotifications;
    if (hideOfflineEl) hideOfflineEl.checked = s.hideOffline !== false;
    if (hidePreviewsEl) hidePreviewsEl.checked = !!s.hidePreviews;
    if (pollMinutesEl) pollMinutesEl.value = Number(s.pollMinutes || 1);
    if (autoFollowEl) autoFollowEl.checked = !!s.autoFollow;
    
    if (translationEnabledEl) {
      translationEnabledEl.checked = !!s.translationEnabled;
    }
    if (targetLanguageEl) {
      targetLanguageEl.value = s.targetLanguage || 'en';
    }
    if (customPrefixEl) {
      customPrefixEl.value = s.customPrefix || '';
    }
    
    pollInterval = Number(s.pollMinutes || 1) * 60;
    
    updateManualChannelVisibility(!!s.autoFollow);
  });
  
  
  chrome.storage.local.get(['chatTranslationSettings'], (result) => {
    const translationSettings = result.chatTranslationSettings || {};
    const translationEnabledEl = document.getElementById('translationEnabled');
    const targetLanguageEl = document.getElementById('targetLanguage');
    const customPrefixEl = document.getElementById('customPrefix');
    
    if (translationEnabledEl) {
      translationEnabledEl.checked = translationSettings.enabled !== false;
    }
    if (targetLanguageEl) {
      targetLanguageEl.value = translationSettings.language || 'zh-tw';
    }
    if (customPrefixEl) {
      customPrefixEl.value = translationSettings.customPrefix || '';
    }
  });
}

function updateManualChannelVisibility(autoFollowEnabled) {
  const manualSection = document.getElementById('manualChannelSection');
  const notificationSection = document.getElementById('notificationSettingsSection');
  const deleteAllBtn = document.getElementById('deleteAllChannels');
  const body = document.body;
  
  chrome.runtime.sendMessage({ type: 'auth:check' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error checking auth status in updateManualChannelVisibility:', chrome.runtime.lastError.message);
      return;
    }
    
    const isAuthorized = response?.authorized || false;
    
    if (!isAuthorized) {
      manualSection.style.display = 'none';
      notificationSection.style.display = 'none';
      return;
    }
    
    if (autoFollowEnabled) {
      manualSection.style.display = 'none';
      notificationSection.style.display = 'block';
      body.classList.add('auto-follow-mode');
    } else {
      manualSection.style.display = 'block';
      notificationSection.style.display = 'block';
      body.classList.remove('auto-follow-mode');
      if (deleteAllBtn) {
        deleteAllBtn.style.display = 'block';
      }
    }
  });
}

function loadNotificationSettings() {
}


function updateAuthStatus(isAuthorized) {
  const authSection = document.getElementById('authSection');
  const authPending = document.getElementById('authPending');
  const manualChannelSection = document.getElementById('manualChannelSection');
  const autoTrackingSection = document.getElementById('autoTrackingSection');
  const notificationSettingsSection = document.getElementById('notificationSettingsSection');
  const translationSection = document.getElementById('translationSection');
  const backupSection = document.getElementById('backupSection');
  const autoFollowCheckbox = document.getElementById('autoFollow');
  const settingsStatusBar = document.getElementById('settingsStatusBar');
  
  if (isAuthorized) {
    document.body.classList.remove('unauthorized');
    authSection.classList.add('hidden');
    autoTrackingSection.style.display = 'block';
    notificationSettingsSection.style.display = 'block';
    if (translationSection) translationSection.style.display = 'block';
    if (backupSection) backupSection.style.display = 'block';
    if (settingsStatusBar) settingsStatusBar.style.display = 'flex';
    chrome.runtime.sendMessage({ type: 'settings:get' }, (res) => {
      const s = res?.settings || {};
      const autoFollowEnabled = !!s.autoFollow;
      if (autoFollowCheckbox) autoFollowCheckbox.checked = autoFollowEnabled;
      if (autoFollowEnabled) {
        manualChannelSection.style.display = 'none';
        document.body.classList.add('auto-follow-mode');
      } else {
        manualChannelSection.style.display = 'block';
        document.body.classList.remove('auto-follow-mode');
      }
    });
  } else {
    document.body.classList.add('unauthorized');
    authSection.classList.remove('hidden');
    authPending.classList.remove('hidden');
    manualChannelSection.style.display = 'none';
    autoTrackingSection.style.display = 'none';
    notificationSettingsSection.style.display = 'block';
    if (translationSection) translationSection.style.display = 'block';
    if (backupSection) backupSection.style.display = 'none';
    if (settingsStatusBar) settingsStatusBar.style.display = 'flex';
  }
}

function checkAuthStatus() {
  chrome.runtime.sendMessage({ type: 'auth:check' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error checking auth status:', chrome.runtime.lastError.message);
      return;
    }
    updateAuthStatus(response?.authorized || false);
  });
}

function toggleOfflineSection(event) {
  const header = event.currentTarget;
  const content = header.nextElementSibling;
  const toggle = header.querySelector('.offline-toggle');
  
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed');
    toggle.textContent = '▲';
  } else {
    content.classList.add('collapsed');
    toggle.textContent = '▼';
  }
}

function saveSettings() {
  const muteNotificationsEl = document.getElementById('muteNotifications');
  const hideOfflineEl = document.getElementById('hideOffline');
  const hidePreviewsEl = document.getElementById('hidePreviews');
  const pollMinutesEl = document.getElementById('pollMinutes');
  const autoFollowEl = document.getElementById('autoFollow');
  const translationEnabledEl = document.getElementById('translationEnabled');
  const targetLanguageEl = document.getElementById('targetLanguage');
  const customPrefixEl = document.getElementById('customPrefix');
  
  const settings = {
    muteNotifications: muteNotificationsEl ? muteNotificationsEl.checked : false,
    hideOffline: hideOfflineEl ? hideOfflineEl.checked : true,
    hidePreviews: hidePreviewsEl ? hidePreviewsEl.checked : false,
    pollMinutes: pollMinutesEl ? Number(pollMinutesEl.value || 1) : 1,
    autoFollow: autoFollowEl ? autoFollowEl.checked : false,
    translationEnabled: translationEnabledEl ? translationEnabledEl.checked : false,
    targetLanguage: targetLanguageEl ? targetLanguageEl.value : 'en',
    customPrefix: customPrefixEl ? customPrefixEl.value : ''
  };
  
  pollInterval = settings.pollMinutes * 60;
  
  updateManualChannelVisibility(settings.autoFollow);
  
  chrome.runtime.sendMessage({ type: 'settings:save', settings }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error saving settings:', chrome.runtime.lastError.message);
      return;
    }
    if (response?.ok) {
      console.log(chrome.i18n.getMessage('settingsAutoSaved'));
      
      
      let formattedCustomPrefix = settings.customPrefix;
      if (formattedCustomPrefix && formattedCustomPrefix.trim()) {
        
        const cleanPrefix = formattedCustomPrefix.replace(/[\[\]]/g, '').trim();
        if (cleanPrefix) {
          formattedCustomPrefix = `[${cleanPrefix}]`;
        }
      }
      
      chrome.storage.local.set({
        chatTranslationSettings: {
          enabled: settings.translationEnabled,
          language: settings.targetLanguage,
          customPrefix: formattedCustomPrefix
        }
      });
      
      if (settings.autoFollow) {
        console.log('Auto-follow enabled, triggering immediate fetch...');
        chrome.runtime.sendMessage({ type: 'test:autoFollow' }, (fetchResponse) => {
          if (chrome.runtime.lastError) {
            console.log('Error triggering auto-follow after settings save:', chrome.runtime.lastError.message);
          } else if (fetchResponse?.ok) {
            console.log('Auto-follow triggered successfully after settings save');
            loadChannels();
          } else {
            console.log('Auto-follow failed after settings save:', fetchResponse?.error);
          }
        });
      } else {
        chrome.runtime.sendMessage({ type: 'streams:list' }, async (res2) => {
          if (!chrome.runtime.lastError && res2?.payload) {
            await renderStreamList(res2.payload, settings);
          }
        });
      }
    }
  });
}

function showStatus(message, type = 'success') {
  const settingsContent = document.getElementById('settingsContent');
  const isSettingsPage = settingsContent && settingsContent.classList.contains('active');
  
  if (isSettingsPage) {
    if (type === 'error') {
      const settingsStatus = document.getElementById('settingsStatus');
      const settingsLastUpdate = document.getElementById('settingsLastUpdate');
      
      if (settingsStatus) {
        settingsStatus.textContent = message;
        settingsStatus.className = `status ${type}`;
      }
      
      if (settingsLastUpdate) {
        const now = new Date();
        settingsLastUpdate.textContent = now.toLocaleTimeString();
      }
      
      setTimeout(() => {
        if (settingsStatus) {
          settingsStatus.textContent = chrome.i18n.getMessage('ready') || 'Ready';
          settingsStatus.className = 'status success';
        }
      }, 3000);
    } else {
      const status = document.createElement('div');
      status.className = `status ${type}`;
      status.textContent = message;
      status.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        z-index: 1000;
        background: ${type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
        color: ${type === 'success' ? '#10b981' : '#ef4444'};
        border: 1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
      `;
      
      document.body.appendChild(status);
      
      setTimeout(() => {
        status.remove();
      }, 3000);
    }
  } else {
    const status = document.createElement('div');
    status.className = `status ${type}`;
    status.textContent = message;
    status.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 1000;
      background: ${type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
      color: ${type === 'success' ? '#10b981' : '#ef4444'};
      border: 1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
    `;
    
    document.body.appendChild(status);
    
    setTimeout(() => {
      status.remove();
    }, 3000);
  }
}

function getPreviewUrl(username, width = 320, height = 180) {
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${username}-${width}x${height}.jpg`;
}

async function renderStreamList(streams, settings) {
  const streamList = document.getElementById('streamList');
  const emptyState = document.getElementById('empty');
  const loadingState = document.getElementById('loading');
  const errorState = document.getElementById('error');
  const statusBar = document.getElementById('status');
  const errorMessageEl = document.getElementById('errorMessage');

  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  errorMessageEl.textContent = '';
  
  const liveStreams = (streams || []).filter(stream => stream.channel);
  const offlineStreams = (streams || []).filter(stream => !stream.channel);
  
  if (liveStreams.length === 0 && offlineStreams.length === 0) {
    emptyState.classList.remove('hidden');
    const noStreamsText = chrome.i18n.getMessage('noStreams');
    statusBar.textContent = noStreamsText;
    
    const settingsStatus = document.getElementById('settingsStatus');
    if (settingsStatus) {
      settingsStatus.textContent = noStreamsText;
      settingsStatus.className = 'status success';
    }
    return;
  }

  emptyState.classList.add('hidden');
  
  if (liveStreams.length > 0) {
    const plural = liveStreams.length === 1 ? '' : 's';
    const statusText = chrome.i18n.getMessage('streamsLive', [liveStreams.length, plural]);
    statusBar.textContent = statusText;
    
    const settingsStatus = document.getElementById('settingsStatus');
    if (settingsStatus) {
      settingsStatus.textContent = statusText;
      settingsStatus.className = 'status success';
    }
  } else {
    const plural = offlineStreams.length === 1 ? '' : 's';
    const statusText = chrome.i18n.getMessage('streamsOffline', [offlineStreams.length, plural]);
    statusBar.textContent = statusText;
    
    const settingsStatus = document.getElementById('settingsStatus');
    if (settingsStatus) {
      settingsStatus.textContent = statusText;
      settingsStatus.className = 'status success';
    }
  }
  
  const lastUpdate = document.getElementById('lastUpdate');
  const settingsLastUpdate = document.getElementById('settingsLastUpdate');
  const channelsLastUpdate = document.getElementById('channelsLastUpdate');
  const timeText = new Date().toLocaleTimeString(navigator.language, { 
    hour12: true, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  if (lastUpdate) {
    lastUpdate.textContent = timeText;
  }
  
  if (settingsLastUpdate) {
    settingsLastUpdate.textContent = timeText;
  }
  
  if (channelsLastUpdate) {
    channelsLastUpdate.textContent = timeText;
  }
  

  const sortedLiveStreams = liveStreams.sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
  
  const sortedOfflineStreams = offlineStreams.sort((a, b) => (a.username || '').localeCompare(b.username || ''));

  await updateStreamList(streamList, sortedLiveStreams, sortedOfflineStreams, settings);

  
  setupStreamTitleTooltips();
}

function isTextOverflowing(element) {
  if (!element) return false;
  
  
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}

function shouldShowTooltip(element, context = '') {
  if (!element) return false;
  
  
  if (element.classList.contains('follow-age') && context === 'channels') {
    return true;
  }
  
  
  if (element.classList.contains('stream-title') && context === 'streams') {
    return isTextOverflowing(element);
  }
  
  
  return isTextOverflowing(element);
}


async function translateText(text, targetLanguage, provider = 'google') {
  if (!text || !targetLanguage) return text;
  
  try {
    
    if (provider === 'google') {
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`);
      const data = await response.json();
      return data[0]?.[0]?.[0] || text;
    }
    
    
    return text;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}


function getStreamTitle(stream) {
  return stream.channel?.status || '';
}

function setupStreamTitleTooltips() {
  let unifiedTooltipEl = null;
  const ensureUnifiedTooltip = () => {
    if (unifiedTooltipEl) return unifiedTooltipEl;
    const el = document.createElement('div');
    el.style.cssText = [
      'position: fixed',
      'z-index: 9999',
      'max-width: 320px',
      'max-height: 260px',
      'overflow: auto',
      'padding: 8px 10px',
      'border-radius: 8px',
      'border: 1px solid var(--border-light)',
      'background: var(--bg-secondary)',
      'color: var(--text-primary)',
      'box-shadow: var(--shadow-medium)',
      'line-height: 1.5',
      'white-space: pre-wrap',
      'display: none'
    ].join(';');
    document.body.appendChild(el);
    unifiedTooltipEl = el;
    return el;
  };

  const positionUnifiedTooltip = (ev) => {
    if (!unifiedTooltipEl || unifiedTooltipEl.style.display === 'none') return;
    const padding = 12;
    let x = ev.clientX + padding;
    let y = ev.clientY + padding;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = unifiedTooltipEl.getBoundingClientRect();
    if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
    if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
    unifiedTooltipEl.style.left = `${x}px`;
    unifiedTooltipEl.style.top = `${y}px`;
  };

  const hoverSelector = '.stream-title';
  const streamList = document.getElementById('streamList');

  if (streamList) {
    streamList.addEventListener('mouseover', (e) => {
      const target = e.target.closest(hoverSelector);
      if (!target) return;
      
      
      if (!shouldShowTooltip(target, 'streams')) return;
      
      const content = target.getAttribute('data-full') || target.textContent || '';
      if (content.length === 0) return;
      const tip = ensureUnifiedTooltip();
      tip.textContent = content;
      tip.style.display = 'block';
      positionUnifiedTooltip(e);
    });

    streamList.addEventListener('mousemove', (e) => {
      if (unifiedTooltipEl && unifiedTooltipEl.style.display === 'block') {
        positionUnifiedTooltip(e);
      }
    });

    streamList.addEventListener('mouseout', (e) => {
      const leavingHover = e.target.closest('.stream-title') && !e.relatedTarget?.closest?.('.stream-title');
      if (leavingHover && unifiedTooltipEl) {
        unifiedTooltipEl.style.display = 'none';
      }
    });
  }
}

async function updateStreamList(streamList, liveStreams, offlineStreams, settings) {
  const existingItems = Array.from(streamList.children);
  const existingLiveItems = existingItems.filter(item => !item.classList.contains('offline-section'));
  const existingOfflineSection = existingItems.find(item => item.classList.contains('offline-section'));
  
  await updateLiveStreamItems(streamList, existingLiveItems, liveStreams, settings);
  
  updateOfflineSection(streamList, existingOfflineSection, offlineStreams, settings);
}

async function updateLiveStreamItems(streamList, existingItems, liveStreams, settings) {
  const itemMap = new Map();
  existingItems.forEach(item => {
    const username = item.querySelector('.streamer-name')?.textContent;
    if (username) {
      itemMap.set(username, item);
    }
  });
  
  for (const [index, stream] of liveStreams.entries()) {
    const username = stream.channel.display_name;
    let item = itemMap.get(username);
    
    if (item) {
      updateStreamItemContent(item, stream, settings);
    } else {
      item = await createStreamItem(stream, settings);
      const insertBefore = existingItems[index] || null;
      if (insertBefore) {
        streamList.insertBefore(item, insertBefore);
      } else {
        streamList.appendChild(item);
      }
    }
  }
  
  const currentUsernames = new Set(liveStreams.map(s => s.channel.display_name));
  existingItems.forEach(item => {
    const username = item.querySelector('.streamer-name')?.textContent;
    if (username && !currentUsernames.has(username)) {
      item.remove();
    }
  });
}

function updateStreamItemContent(item, stream, settings) {
  const img = item.querySelector('.stream-thumbnail img');
  if (img) {
    const thumbnailUrl = getPreviewUrl(stream.username, 640, 360) + `?t=${Date.now()}`;
    img.src = thumbnailUrl;
  }
  
  const title = item.querySelector('.stream-title');
  if (title) {
    title.textContent = stream.channel.status;
    title.setAttribute('data-full', (stream.channel.status || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
  }
  
  const gameName = item.querySelector('.game-name');
  if (gameName) {
    gameName.textContent = stream.game;
  }
  
  const viewerCount = item.querySelector('.viewer-count');
  if (viewerCount) {
    viewerCount.textContent = formatViewerCount(stream.viewers || 0);
  }
  
  const timeSpan = item.querySelector('.live-time span[aria-hidden="true"]');
  if (timeSpan && stream.created_at) {
    const newTime = formatStreamTime(stream.created_at);
    if (timeSpan.textContent !== newTime) {
      timeSpan.textContent = newTime;
      item.dataset.startTime = stream.created_at;
    }
  }
  
  const durationLabel = item.querySelector('.duration-label');
  if (durationLabel && stream.created_at) {
        const newDurationLabel = chrome.i18n.getMessage('liveStreamDuration', [formatStreamTime(stream.created_at)]);
    if (durationLabel.textContent !== newDurationLabel) {
      durationLabel.textContent = newDurationLabel;
    }
  }
}

async function createStreamItem(stream, settings) {
    const item = document.createElement('li');
    item.className = 'stream-item fade-in';
  if (stream.created_at) {
    item.dataset.startTime = stream.created_at;
  }
  
  item.addEventListener('click', () => {
      const url = `https://www.twitch.tv/${stream.username}`;
      chrome.tabs.create({ url });
    });
    
  let removeBtn = null;
  if (!settings?.autoFollow) {
    removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '×';
    removeBtn.title = chrome.i18n.getMessage('remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (removeBtn.disabled) return;
      removeBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'streams:remove', username: stream.username }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
          removeBtn.disabled = false;
          return;
        }
        if (response?.ok) {
          refresh();
        } else {
          const msg = response?.error || chrome.i18n.getMessage('deleteFailed') || 'Delete failed';
          showStatus(`❌ ${msg}`, 'error');
          removeBtn.disabled = false;
        }
      });
    });
  }
    
  const thumbnailUrl = getPreviewUrl(stream.username, 640, 360) + `?t=${Date.now()}`;
      const thumbnailHtml = settings.hidePreviews ? '' : `
        <div class="stream-thumbnail">
          <img src="${thumbnailUrl}" alt="${stream.username} stream" />
        </div>
      `;

  
  const displayTitle = stream.channel.status;
  const originalTitle = stream.channel.status;

  const streamContentHtml = `
        <div class="stream-content">
          ${thumbnailHtml}
          <div class="stream-info">
            <div class="stream-title" data-full="${(originalTitle || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" data-translated="${(displayTitle || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">${displayTitle}</div>
            <div class="stream-meta">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; min-width: 0;">
              <span class="streamer-name">${stream.channel.display_name}</span>
              <span class="game-name">${stream.game}</span>
          </div>
          <div class="stream-stats">
            <div class="viewer-section">
              <div class="viewer-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill-rule="evenodd" d="M5 7a5 5 0 1 1 6.192 4.857A2 2 0 0 0 13 13h1a3 3 0 0 1 3 3v2h-2v-2a1 1 0 0 0-1-1h-1a3.99 3.99 0 0 1-3-1.354A3.99 3.99 0 0 1 7 15H6a1 1 0 0 0-1 1v2H3v-2a3 3 0 0 1 3-3h1a2 2 0 0 0 1.808-1.143A5.002 5.002 0 0 1 5 7zm5 3a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <strong class="viewer-count">${formatViewerCount(stream.viewers || 0)}</strong>
              <p class="viewer-label">${chrome.i18n.getMessage('viewerCount')}: ${formatViewerCount(stream.viewers || 0)}</p>
            </div>
            <div class="duration-section">
              <span class="live-time">
                <span aria-hidden="true">${formatStreamTime(stream.created_at)}</span>
                <p class="duration-label">${chrome.i18n.getMessage('liveStreamDuration', [formatStreamTime(stream.created_at)])}</p>
              </span>
            </div>
          </div>
            </div>
          </div>
        </div>
      `;
  
    item.innerHTML = streamContentHtml;
    if (removeBtn) {
      item.appendChild(removeBtn);
    }
  return item;
}

function updateOfflineSection(streamList, existingOfflineSection, offlineStreams, settings) {
  if (offlineStreams.length > 0 && !settings.hideOffline) {
    if (existingOfflineSection) {
  const offlineList = existingOfflineSection.querySelector('.offline-list');
      const title = existingOfflineSection.querySelector('.offline-title');
      
      if (title) {
        title.textContent = chrome.i18n.getMessage('offlineStreamers', [offlineStreams.length]);
      }
      
  updateOfflineStreamItems(offlineList, offlineStreams, settings);
    } else {
  const offlineSection = createOfflineSection(offlineStreams, settings);
      streamList.appendChild(offlineSection);
    }
  } else if (existingOfflineSection) {
  existingOfflineSection.remove();
  }
}

function updateOfflineStreamItems(offlineList, offlineStreams, settings) {
  const existingItems = Array.from(offlineList.children);
  const itemMap = new Map();
  
  existingItems.forEach(item => {
    const username = item.querySelector('.stream-title')?.textContent?.replace(' (Offline)', '');
    if (username) {
      itemMap.set(username, item);
    }
  });
  
  offlineStreams.forEach((stream, index) => {
    const username = stream.username;
    let item = itemMap.get(username);
    
    if (!item) {
      item = createOfflineStreamItem(stream, settings);
      offlineList.insertBefore(item, existingItems[index] || null);
    }
  });
  
  const currentUsernames = new Set(offlineStreams.map(s => s.username));
  existingItems.forEach(item => {
    const username = item.querySelector('.stream-title')?.textContent?.replace(' (Offline)', '');
    if (username && !currentUsernames.has(username)) {
      item.remove();
    }
  });
}

function createOfflineSection(offlineStreams, settings) {
  const offlineSection = document.createElement('div');
  offlineSection.className = 'offline-section';
  offlineSection.innerHTML = `
    <div class="offline-header">
      <span class="offline-title">${chrome.i18n.getMessage('offlineStreamers', [offlineStreams.length])}</span>
      <span class="offline-toggle">▼</span>
    </div>
    <div class="offline-content collapsed">
      <br><ul class="offline-list"></ul>
    </div>
  `;
  
  const offlineHeader = offlineSection.querySelector('.offline-header');
  offlineHeader.addEventListener('click', toggleOfflineSection);
  
  const offlineList = offlineSection.querySelector('.offline-list');
  offlineStreams.forEach(stream => {
    const item = createOfflineStreamItem(stream, settings);
    offlineList.appendChild(item);
  });
  
  return offlineSection;
}

function createOfflineStreamItem(stream, settings) {
  const item = document.createElement('li');
  item.className = 'stream-item offline-item fade-in';
  item.addEventListener('click', () => {
    const url = `https://www.twitch.tv/${stream.username}`;
    chrome.tabs.create({ url });
  });
  
  let removeBtn = null;
  if (!settings?.autoFollow) {
    removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '×';
    removeBtn.title = chrome.i18n.getMessage('remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
  const confirmMessage = chrome.i18n.getMessage('confirmDeleteChannel', [stream.username]);
      showConfirmDialog(confirmMessage, () => {
        if (removeBtn.disabled) return;
        removeBtn.disabled = true;
        chrome.runtime.sendMessage({ type: 'streams:remove', username: stream.username }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
            removeBtn.disabled = false;
            return;
          }
          if (response?.ok) {
            renderChips(response.channels || []);
            refresh();
          } else {
            const msg = response?.error || chrome.i18n.getMessage('deleteFailed') || 'Delete failed';
            showStatus(`❌ ${msg}`, 'error');
            removeBtn.disabled = false;
          }
        });
      }, null, chrome.i18n.getMessage('confirmDelete'));
    });
  }

  item.innerHTML = `
    <div class="stream-content">
      <div class="stream-info">
        <div class="stream-title">${stream.username} (${chrome.i18n.getMessage('offline')})</div>
      </div>
    </div>
  `;
  if (removeBtn) {
    item.appendChild(removeBtn);
  }
  return item;
}

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('empty').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');
  document.getElementById('streamList').innerHTML = '';
}

function refresh() {
  showLoading();
  chrome.runtime.sendMessage({ type: 'streams:list' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error refreshing streams:', chrome.runtime.lastError.message);
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('error').classList.remove('hidden');
      document.getElementById('errorMessage').textContent = chrome.i18n.getMessage('unableToLoadStreamData');
      return;
    }
    if (response?.payload) {
      chrome.runtime.sendMessage({ type: 'settings:get' }, async (settingsRes) => {
        if (chrome.runtime.lastError) {
          console.log('Error loading settings for refresh:', chrome.runtime.lastError.message);
          await renderStreamList(response.payload, {});
          return;
        }
        await renderStreamList(response.payload, settingsRes?.settings || {});
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString(navigator.language);
      });
    } else {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('error').classList.remove('hidden');
      document.getElementById('errorMessage').textContent = chrome.i18n.getMessage('unableToLoadStreamData');
    }
  });
}

function filterStreams(searchTerm) {
  const streamItems = document.querySelectorAll('#streamList li');
  const searchLower = searchTerm.toLowerCase();
  
  streamItems.forEach(item => {
    const streamerName = item.querySelector('.streamer-name')?.textContent.toLowerCase() || '';
    const title = item.querySelector('.stream-title')?.textContent.toLowerCase() || '';
    
    if (streamerName.includes(searchLower) || title.includes(searchLower)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

function filterChannels(searchTerm) {
  const channelItems = document.querySelectorAll('.channel-item');
  const searchLower = searchTerm.toLowerCase();
  
  channelItems.forEach(item => {
    const channelName = item.querySelector('.channel-name')?.textContent.toLowerCase() || '';
    
    if (channelName.includes(searchLower)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function renderChannelsList() {
  chrome.runtime.sendMessage({ type: 'streams:list' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error loading channels for management:', chrome.runtime.lastError.message);
      return;
    }
    
    const channelsList = document.getElementById('channelsList');
    const channelsStatus = document.getElementById('channelsStatus');
    const channelsLastUpdate = document.getElementById('channelsLastUpdate');
    
    if (!response?.payload || response.payload.length === 0) {
      channelsList.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
              <polyline points="17 2 12 7 7 2"></polyline>
            </svg>
          </div>
          <h3>${chrome.i18n.getMessage('noChannels')}</h3>
          <p>${chrome.i18n.getMessage('noChannelsDescription')}</p>
        </div>
      `;
      
      if (channelsStatus) {
        channelsStatus.textContent = chrome.i18n.getMessage('noChannels');
      }
      if (channelsLastUpdate) {
        channelsLastUpdate.textContent = new Date().toLocaleTimeString(navigator.language, { 
          hour12: true, 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
      }
      return;
    }
    
    if (channelsStatus) {
      const totalChannels = response.payload.length;
      channelsStatus.textContent = chrome.i18n.getMessage('trackedChannelsCount', [totalChannels]);
    }
    if (channelsLastUpdate) {
      channelsLastUpdate.textContent = new Date().toLocaleTimeString(navigator.language, { 
        hour12: true, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    }
    
  chrome.runtime.sendMessage({ type: 'notification:get' }, (notificationResponse) => {
      if (chrome.runtime.lastError) {
        console.log('Error loading notification settings:', chrome.runtime.lastError.message);
        return;
      }
      
      const notificationSettings = notificationResponse?.settings || {};
      
      chrome.storage.local.get(['tsn_user_desc_cache'], (cacheObj) => {
        const cache = cacheObj?.tsn_user_desc_cache || {};
        const allLogins = response.payload.map(c => String(c.username).toLowerCase()).filter(Boolean);
        const userMap = {};
        const missing = [];
        const nowTs = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        allLogins.forEach(login => {
          const entry = cache[login];
          if (entry && entry.desc !== undefined && (nowTs - (entry.ts || 0) < maxAge)) {
            userMap[login] = { description: entry.desc };
          } else {
            missing.push(login);
          }
        });

        const renderWith = (map) => {
          channelsList.innerHTML = response.payload.map(channel => {
        const isNotificationEnabled = notificationSettings[channel.username] === true;
        const login = channel.username;
        const displayName = channel.displayName || login;
          const uinfo = map[login?.toLowerCase?.() || login] || {};
          const description = uinfo.description || '';
        const followedAtRaw = channel.followedAt || null;
        let followDisplay = chrome.i18n.getMessage('unknown') || 'Unknown';
        let followTitle = '';
        if (followedAtRaw) {
          const followedDate = new Date(followedAtRaw);
          const now = new Date();
          const msPerDay = 24 * 60 * 60 * 1000;
          const totalDays = Math.max(0, Math.floor((now - followedDate) / msPerDay));
          const years = Math.floor(totalDays / 365);
          const days = totalDays % 365;
          if (years > 0) {
            followDisplay = days > 0
              ? chrome.i18n.getMessage('followAgeYearsDays', [years, days])
              : chrome.i18n.getMessage('followAgeYearsOnly', [years]);
          } else {
            followDisplay = chrome.i18n.getMessage('followAgeDaysOnly', [days]);
          }
          followTitle = followedDate.toLocaleString(navigator.language);
        }
        
          const nameLine = (displayName && displayName.toLowerCase() !== String(login).toLowerCase())
            ? `${displayName} (${login})`
            : login;

          return `
          <div class="channel-item" data-channel-id="${login}">
            <div class="channel-header">
              <a href="https://www.twitch.tv/${login}" target="_blank" class="channel-name">
                ${nameLine}
              </a>
            </div>
            <div class="channel-details">
              ${description ? `<div class=\"channel-desc\" data-full=\"${description.replace(/\\/g, '\\\\').replace(/\n/g, '&#10;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\">${description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
              <span class="follow-age" data-full="${followTitle}">${followDisplay}</span>
            </div>
			
            <div class="channel-notification">
              <span class="notification-label">${chrome.i18n.getMessage('enableNotifications')}</span>
              <label class="toggle-switch">
                <input type="checkbox" ${isNotificationEnabled ? 'checked' : ''} 
                       data-channel-id="${login}">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          `;
        }).join('');
        };

        renderWith(userMap);

        if (missing.length > 0) {
          chrome.runtime.sendMessage({ type: 'users:getInfoBatch', logins: missing }, (usersRes) => {
            const fetched = usersRes?.users || {};
            const nextCache = { ...cache };
            Object.keys(fetched).forEach(login => {
              nextCache[login] = { desc: fetched[login].description || '', ts: Date.now() };
              userMap[login] = { description: fetched[login].description || '' };
            });
            chrome.storage.local.set({ tsn_user_desc_cache: nextCache });
            renderWith(userMap);
          });
        }
      });
      
      channelsList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.hasAttribute('data-channel-id')) {
          const channelId = e.target.getAttribute('data-channel-id');
          const enabled = e.target.checked;
          
          notificationSettings[channelId] = enabled;
          
          chrome.runtime.sendMessage({ 
            type: 'notification:save', 
            settings: notificationSettings
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Error saving notification settings:', chrome.runtime.lastError.message);
              return;
            }
            if (response?.ok) {
              console.log(`Notification for ${channelId} ${enabled ? 'enabled' : 'disabled'}`);
              
              if (enabled) {
                chrome.runtime.sendMessage({ 
                  type: 'notification:checkChannel', 
                  channelId: channelId 
                }, (checkResponse) => {
                  if (chrome.runtime.lastError) {
                    console.log('Error checking channel status:', chrome.runtime.lastError.message);
                    return;
                  }
                  if (checkResponse?.isLive) {
                    console.log(`Channel ${channelId} is currently live, immediate notification sent`);
                  } else if (checkResponse?.muted) {
                    console.log(`Channel ${channelId} notification skipped due to global mute setting`);
                  } else {
                    console.log(`Channel ${channelId} is not currently live, will notify when they go live`);
                  }
                });
              }
            }
          });
        }
      });
    });
  });

  let unifiedTooltipEl = null;
  const ensureUnifiedTooltip = () => {
    if (unifiedTooltipEl) return unifiedTooltipEl;
    const el = document.createElement('div');
    el.style.cssText = [
      'position: fixed',
      'z-index: 9999',
      'max-width: 320px',
      'max-height: 260px',
      'overflow: auto',
      'padding: 8px 10px',
      'border-radius: 8px',
      'border: 1px solid var(--border-light)',
      'background: var(--bg-secondary)',
      'color: var(--text-primary)',
      'box-shadow: var(--shadow-medium)',
      'line-height: 1.5',
      'white-space: pre-wrap',
      'display: none'
    ].join(';');
    document.body.appendChild(el);
    unifiedTooltipEl = el;
    return el;
  };

  const positionUnifiedTooltip = (ev) => {
    if (!unifiedTooltipEl || unifiedTooltipEl.style.display === 'none') return;
    const padding = 12;
    let x = ev.clientX + padding;
    let y = ev.clientY + padding;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = unifiedTooltipEl.getBoundingClientRect();
    if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
    if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
    unifiedTooltipEl.style.left = `${x}px`;
    unifiedTooltipEl.style.top = `${y}px`;
  };

  const hoverSelector = '.channel-desc, .follow-age, .stream-title';

  channelsList.addEventListener('mouseover', (e) => {
    const target = e.target.closest(hoverSelector);
    if (!target) return;
    
    
    if (!shouldShowTooltip(target, 'channels')) return;
    
    const content = target.getAttribute('data-full') || target.textContent || '';
    const tip = ensureUnifiedTooltip();
    tip.textContent = content;
    tip.style.display = 'block';
    positionUnifiedTooltip(e);
  });

  channelsList.addEventListener('mousemove', (e) => {
    if (unifiedTooltipEl && unifiedTooltipEl.style.display === 'block') {
      positionUnifiedTooltip(e);
    }
  });

  channelsList.addEventListener('mouseout', (e) => {
    const leavingHover = (e.target.closest('.channel-desc') || e.target.closest('.follow-age')) && !(e.relatedTarget?.closest?.('.channel-desc') || e.relatedTarget?.closest?.('.follow-age'));
    if (leavingHover && unifiedTooltipEl) {
      unifiedTooltipEl.style.display = 'none';
    }
  });
}

document.getElementById('streamsTab').addEventListener('click', () => switchTab('streams'));
document.getElementById('channelsTab').addEventListener('click', () => {
  switchTab('channels');
  renderChannelsList();
});
document.getElementById('settingsTab').addEventListener('click', () => switchTab('settings'));

document.getElementById('streamsSearch')?.addEventListener('input', (e) => {
  filterStreams(e.target.value);
});

document.getElementById('channelsSearch')?.addEventListener('input', (e) => {
  filterChannels(e.target.value);
});

document.getElementById('selectAllChannels')?.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.channel-item input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

document.getElementById('deselectAllChannels')?.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.channel-item input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

document.getElementById('addChannel').addEventListener('click', () => {
  const input = document.getElementById('channelInput');
  const value = input.value.trim();
  if (!value) {
    showStatus(chrome.i18n.getMessage('pleaseEnterChannelName'), 'error');
    return;
  }
  
  const newChannels = parseChannels(value);
  chrome.runtime.sendMessage({ type: 'streams:add', usernames: newChannels }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error adding channels:', chrome.runtime.lastError.message);
      showStatus(`❌ ${chrome.i18n.getMessage('addFailed', [chrome.runtime.lastError.message])}`, 'error');
      return;
    }
    if (response?.ok) {
      input.value = '';
      renderChips(response.channels || []);
      showStatus(chrome.i18n.getMessage('addedChannels', [newChannels.length]), 'success');
      saveSettings();
    } else {
      showStatus(chrome.i18n.getMessage('addChannelFailed'), 'error');
    }
  });
});

        document.getElementById('authorizeBtn').addEventListener('click', () => {
          const btn = document.getElementById('authorizeBtn');
          btn.disabled = true;
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; animation: spin 1s linear infinite;">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
          </svg>${chrome.i18n.getMessage('authorizing')}`;
          
          chrome.runtime.sendMessage({ type: 'auth:start' }, (response) => {
            btn.disabled = false;
            btn.textContent = `🔑 ${chrome.i18n.getMessage('authorizeTwitchAccount')}`;
            
            if (chrome.runtime.lastError) {
              console.log('Error during authorization:', chrome.runtime.lastError.message);
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [chrome.runtime.lastError.message])}`, 'error');
              return;
            }
            if (response?.ok) {
              showStatus(`✅ ${chrome.i18n.getMessage('authorizationSuccess')}`, 'success');
              updateAuthStatus(true);
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });

        document.getElementById('headerAuthBtn').addEventListener('click', () => {
          const btn = document.getElementById('headerAuthBtn');
          btn.disabled = true;
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; animation: spin 1s linear infinite;">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
          </svg>${chrome.i18n.getMessage('authorizing')}`;
          
          chrome.runtime.sendMessage({ type: 'auth:start' }, (response) => {
            btn.disabled = false;
            btn.textContent = `🔑 ${chrome.i18n.getMessage('authorizeTwitchAccount')}`;
            
            if (chrome.runtime.lastError) {
              console.log('Error during authorization:', chrome.runtime.lastError.message);
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [chrome.runtime.lastError.message])}`, 'error');
              return;
            }
            if (response?.ok) {
              showStatus(`✅ ${chrome.i18n.getMessage('authorizationSuccess')}`, 'success');
              updateAuthStatus(true);
              loadUserProfile();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });

        document.getElementById('headerAuthBtn2').addEventListener('click', () => {
          const btn = document.getElementById('headerAuthBtn2');
          btn.disabled = true;
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; animation: spin 1s linear infinite;">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
          </svg>${chrome.i18n.getMessage('authorizing')}`;
          
          chrome.runtime.sendMessage({ type: 'auth:start' }, (response) => {
            btn.disabled = false;
            btn.textContent = `🔑 ${chrome.i18n.getMessage('authorizeTwitchAccount')}`;
            
            if (chrome.runtime.lastError) {
              console.log('Error during authorization:', chrome.runtime.lastError.message);
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [chrome.runtime.lastError.message])}`, 'error');
              return;
            }
            if (response?.ok) {
              showStatus(`✅ ${chrome.i18n.getMessage('authorizationSuccess')}`, 'success');
              updateAuthStatus(true);
              loadUserProfile();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });

        document.getElementById('testAutoFollow').addEventListener('click', () => {
          const btn = document.getElementById('testAutoFollow');
          btn.disabled = true;
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; animation: spin 1s linear infinite;">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
          </svg>${chrome.i18n.getMessage('fetching')}`;
          
          chrome.runtime.sendMessage({ type: 'test:autoFollow' }, (response) => {
            btn.disabled = false;
            btn.textContent = chrome.i18n.getMessage('manualTriggerAutoFetch');
            
            if (chrome.runtime.lastError) {
              console.log('Error triggering auto-follow:', chrome.runtime.lastError.message);
              showStatus(`❌ ${chrome.i18n.getMessage('fetchFailed', [chrome.runtime.lastError.message])}`, 'error');
              return;
            }
            if (response?.ok) {
              let message = '';
              if (response.newCount > 0 && response.removedCount > 0) {
                message = `✅ ${chrome.i18n.getMessage('syncComplete', [response.newCount, response.removedCount])}`;
              } else if (response.newCount > 0) {
                message = `✅ ${chrome.i18n.getMessage('fetchSuccess', [response.newCount])}`;
              } else if (response.removedCount > 0) {
                message = `✅ ${chrome.i18n.getMessage('removedChannels', [response.removedCount])}`;
              } else {
                message = `✅ ${chrome.i18n.getMessage('fetchComplete', [response.count])}`;
              }
              showStatus(message, 'success');
              loadChannels();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('fetchFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });





document.getElementById('channelInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('addChannel').click();
  }
});

function showConfirmDialog(message, onConfirm, onCancel, confirmText = null) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    max-width: 300px;
    width: 90%;
    box-shadow: var(--shadow-strong);
  `;
  
  dialog.innerHTML = `
    <div style="margin-bottom: var(--spacing-md);">
      <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: var(--spacing-sm);">
        ${chrome.i18n.getMessage('deleteAllChannels')}
      </div>
      <div style="font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
        ${message.includes('<br>') ? message : message.replace(/\n/g, '<br>')}
      </div>
    </div>
    <div style="display: flex; gap: var(--spacing-sm); justify-content: flex-end;">
      <button id="confirmCancel" style="
        padding: 8px 16px;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      ">${chrome.i18n.getMessage('cancel') || 'Cancel'}</button>
      <button id="confirmOk" style="
        padding: 8px 16px;
        background: #ef4444;
        color: white;
        border: 1px solid #ef4444;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      ">${confirmText || chrome.i18n.getMessage('deleteAllChannels')}</button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  const cancelBtn = dialog.querySelector('#confirmCancel');
  const okBtn = dialog.querySelector('#confirmOk');
  
  const cleanup = () => {
    document.body.removeChild(overlay);
  };
  
  cancelBtn.addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });
  
  okBtn.addEventListener('click', () => {
    cleanup();
    if (onConfirm) onConfirm();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cleanup();
      if (onCancel) onCancel();
    }
  });
}

function deleteAllChannels() {
  const confirmMessage = chrome.i18n.getMessage('deleteAllChannelsConfirm');
  showConfirmDialog(confirmMessage, () => {
    chrome.runtime.sendMessage({ type: 'streams:deleteAll' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Error deleting all channels:', chrome.runtime.lastError.message);
        showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response?.ok) {
        showStatus(chrome.i18n.getMessage('allChannelsDeleted'), 'success');
        renderChips([]);
        refresh();
      } else {
        showStatus(`❌ ${response?.error || chrome.i18n.getMessage('deleteFailed') || 'Delete failed'}`, 'error');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
      const settingsElements = ['muteNotifications', 'hideOffline', 'hidePreviews', 'pollMinutes', 'autoFollow', 'translationEnabled', 'targetLanguage', 'customPrefix'];
  settingsElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', saveSettings);
    }
  });

  const exportBtn = document.getElementById('exportSettings');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'settings:export' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Error exporting settings:', chrome.runtime.lastError.message);
        showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response?.ok) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `twitch-live-extension-settings-${timestamp}.json`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showStatus(`✅ ${chrome.i18n.getMessage('exportSuccess')}`, 'success');
      } else {
        showStatus(`❌ ${response?.error || 'Export failed'}`, 'error');
      }
    });
    });
  }

  const importBtn = document.getElementById('importSettings');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });
  }

  const importFileInput = document.getElementById('importFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
      showStatus(`❌ ${chrome.i18n.getMessage('noFileSelected')}`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        if (!importData.version || !importData.settings) {
          throw new Error('Invalid settings file format');
        }

        const confirmMessage = chrome.i18n.getMessage('importConfirm', [importData.timestamp || 'Unknown']);
        showConfirmDialog(confirmMessage, () => {
          chrome.runtime.sendMessage({ type: 'settings:import', data: importData }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Error importing settings:', chrome.runtime.lastError.message);
              showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
              return;
            }
            if (response?.ok) {
              showStatus(`✅ ${chrome.i18n.getMessage('importSuccess')}`, 'success');
              loadSettings();
              refresh();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('importFailed', [response?.error || 'Unknown error'])}`, 'error');
            }
          });
        }, null, chrome.i18n.getMessage('confirmImport'));
      } catch (error) {
        console.error('Error parsing import file:', error);
        showStatus(`❌ ${chrome.i18n.getMessage('importFailed', [error.message])}`, 'error');
      }
    };
    reader.readAsText(file);
    
    event.target.value = '';
    });
  }
  
  const deleteAllBtn = document.getElementById('deleteAllChannels');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', deleteAllChannels);
  }
  
  const selectAllBtn = document.getElementById('selectAllNotifications');
  const deselectAllBtn = document.getElementById('deselectAllNotifications');
  
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#notificationChannels input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }
  
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#notificationChannels input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'streams:update') {
    chrome.runtime.sendMessage({ type: 'settings:get' }, async (res) => {
      if (chrome.runtime.lastError) {
        console.log('Error loading settings in message listener:', chrome.runtime.lastError.message);
        await renderStreamList(msg.payload || [], {});
        return;
      }
      await renderStreamList(msg.payload || [], res?.settings || {});
    });
  }
});

function updateStreamTimes() {
  const timeElements = document.querySelectorAll('.live-time span[aria-hidden="true"]');
  timeElements.forEach(element => {
    const streamItem = element.closest('.stream-item');
    if (streamItem) {
      const startTime = streamItem.dataset.startTime;
      if (startTime) {
        const newTime = formatStreamTime(startTime);
        if (element.textContent !== newTime) {
          element.textContent = newTime;
        }
      }
    }
  });
  
  const durationLabels = document.querySelectorAll('.duration-label');
  durationLabels.forEach(element => {
    const streamItem = element.closest('.stream-item');
    if (streamItem) {
      const startTime = streamItem.dataset.startTime;
      if (startTime) {
        const newDurationLabel = chrome.i18n.getMessage('liveStreamDuration', [formatStreamTime(startTime)]);
        if (element.textContent !== newDurationLabel) {
          element.textContent = newDurationLabel;
        }
      }
    }
  });
}

let timeUpdateInterval;
let countdownInterval;

let pollInterval = 60;

function startTimeUpdates() {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
  }
  timeUpdateInterval = setInterval(updateStreamTimes, 1000);
}

function stopTimeUpdates() {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }
}

function startCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  countdownInterval = setInterval(updateCountdown, 1000);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function updateCountdown() {
  chrome.runtime.sendMessage({ type: 'countdown:get' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error getting countdown:', chrome.runtime.lastError.message);
      return;
    }
    
    if (response?.ok) {
      const remaining = response.remaining || 0;
      
      const countdownElements = [
        document.getElementById('countdown'),
        document.getElementById('channelsCountdown'),
        document.getElementById('settingsCountdown')
      ];
      
      countdownElements.forEach(element => {
        if (element) {
          element.textContent = remaining;
        }
      });
      
      const updateInfoElements = [
        document.getElementById('updateInfo'),
        document.getElementById('channelsUpdateInfo'),
        document.getElementById('settingsUpdateInfo')
      ];
      
      updateInfoElements.forEach(element => {
        if (element) {
          element.style.display = 'flex';
        }
      });

      
      try {
        const settingsLastUpdate = document.getElementById('settingsLastUpdate');
        if (settingsLastUpdate && !settingsLastUpdate.textContent) {
          const now = new Date().toLocaleTimeString(navigator.language, {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          settingsLastUpdate.textContent = now;
        }
      } catch (_) {}
    }
  });
}

function i18n() {
  const browserLang = navigator.language || navigator.languages[0];
  document.documentElement.lang = browserLang;
  
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      if (message.includes('<br>') || message.includes('<')) {
        element.innerHTML = message;
      } else {
        element.textContent = message;
      }
    }
  });
  
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.placeholder = message;
    }
  });
}

function loadUserProfile() {
  chrome.runtime.sendMessage({ type: 'auth:check' }, (authResponse) => {
    if (chrome.runtime.lastError) {
      console.log('Error checking auth status:', chrome.runtime.lastError.message);
      return;
    }
    
    const isAuthorized = authResponse?.authorized || false;
    
    if (isAuthorized) {
      chrome.runtime.sendMessage({ type: 'auth:getUserInfo' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Error loading user profile:', chrome.runtime.lastError.message);
          return;
        }
        
        if (response?.userInfo) {
          const { id, login, display_name, description, profile_image_url, email, created_at } = response.userInfo;
          
          const userAvatar = document.getElementById('userAvatar');
          const userName = document.getElementById('userName');
          const headerAuthBtn = document.getElementById('headerAuthBtn');
          
          if (userAvatar && userName) {
            userAvatar.src = profile_image_url;
            userAvatar.style.display = 'block';
            userName.textContent = display_name;
            userName.style.display = 'block';
            if (headerAuthBtn) {
              headerAuthBtn.style.display = 'none';
            }
          }
          
          const userAvatar2 = document.getElementById('userAvatar2');
          const userName2 = document.getElementById('userName2');
          const headerAuthBtn2 = document.getElementById('headerAuthBtn2');
          
          if (userAvatar2 && userName2) {
            userAvatar2.src = profile_image_url;
            userAvatar2.style.display = 'block';
            userName2.textContent = display_name;
            userName2.style.display = 'block';
            if (headerAuthBtn2) {
              headerAuthBtn2.style.display = 'none';
            }
          }

          const uiWrap = document.getElementById('channelsUserInfo');
          const uiAvatar = document.getElementById('channelsUserAvatar');
          const uiName = document.getElementById('channelsUserName');
          const uiEmail = document.getElementById('channelsUserEmail');
          const uiDesc = document.getElementById('channelsUserDesc');
          if (uiWrap && uiAvatar && uiName && uiEmail && uiDesc) {
            uiWrap.style.display = 'block';
            uiAvatar.src = profile_image_url;
            uiName.textContent = `${display_name} (@${login})`;
            uiEmail.textContent = email ? `· ${email}` : '';
            uiDesc.textContent = description || '';
          }

          const suWrap = document.getElementById('settingsUserInfo');
          const suAvatar = document.getElementById('settingsUserAvatar');
          const suName = document.getElementById('settingsUserName');
          const suLogin = document.getElementById('settingsUserLogin');
          const suEmail = document.getElementById('settingsUserEmail');
          const suCreated = document.getElementById('settingsUserCreatedAt');
          const suDesc = document.getElementById('settingsUserDesc');
          if (suWrap && suAvatar && suName && suLogin && suCreated && suDesc) {
            suWrap.style.display = 'block';
            suAvatar.src = profile_image_url;
            suName.textContent = display_name || '';
            suLogin.textContent = login ? `(@${login})` : '';
            suCreated.textContent = created_at ? chrome.i18n.getMessage('accountCreatedAt', [new Date(created_at).toLocaleString(navigator.language)]) : '';
            suDesc.textContent = description || '';
          }

          setTimeout(() => {
            const btn = document.getElementById('logoutBtn');
            if (btn) {
              btn.onclick = null;
              btn.addEventListener('click', () => {
                showConfirmDialog('確定要登出 Twitch 嗎？\n這會清除授權並需要重新登入。', () => {
                  showConfirmDialog('再次確認：立即登出？', () => {
                    chrome.runtime.sendMessage({ type: 'auth:revoke' }, (res) => {
                      if (chrome.runtime.lastError) {
                        showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
                        return;
                      }
                      if (res?.ok) {
                        showStatus('✅ 已登出', 'success');
                        updateAuthStatus(false);
                        loadUserProfile();
                      }
                    });
                  }, null, '確定登出');
                }, null, '下一步');
              }, { once: true });
            }
          }, 0);
        }
      });
    } else {
      const userAvatar = document.getElementById('userAvatar');
      const userName = document.getElementById('userName');
      const headerAuthBtn = document.getElementById('headerAuthBtn');
      
      if (userAvatar && userName) {
        userAvatar.style.display = 'none';
        userName.style.display = 'none';
        if (headerAuthBtn) {
          headerAuthBtn.style.display = 'block';
        }
      }
      
      const userAvatar2 = document.getElementById('userAvatar2');
      const userName2 = document.getElementById('userName2');
      const headerAuthBtn2 = document.getElementById('headerAuthBtn2');
      
      if (userAvatar2 && userName2) {
        userAvatar2.style.display = 'none';
        userName2.style.display = 'none';
        if (headerAuthBtn2) {
          headerAuthBtn2.style.display = 'block';
        }
      }

      const uiWrap = document.getElementById('channelsUserInfo');
      if (uiWrap) uiWrap.style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  i18n();
  refresh();
  checkAuthStatus();
  loadUserProfile();
  startTimeUpdates();
  startCountdown();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTimeUpdates();
    stopCountdown();
  } else {
    startTimeUpdates();
    startCountdown();
  }
});
