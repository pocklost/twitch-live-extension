let viewerCountSettings = { useKDisplay: false };
let chatTranslationSettings = { enabled: false, provider: 'microsoft', language: 'zh-tw', customPrefix: '' };

function formatViewerCount(count) {
  const useKDisplayEl = document.getElementById('useKDisplay');
  const useKDisplay = useKDisplayEl ? useKDisplayEl.checked : false;
  
  if (useKDisplay) {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  } else {
    return count.toLocaleString();
  }
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
  while (chips.firstChild) {
    chips.removeChild(chips.firstChild);
  }
  (channels || []).forEach((c) => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    const textNode = document.createTextNode(c + ' ');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove';
    removeBtn.setAttribute('data-channel', c);
    removeBtn.textContent = '×';
    tag.appendChild(textNode);
    tag.appendChild(removeBtn);
    chips.appendChild(tag);
  });
  chips.querySelectorAll('.tag-remove').forEach((el) => {
    el.addEventListener('click', () => {
      const toRemove = el.getAttribute('data-channel');
      const confirmMessage = chrome.i18n.getMessage('confirmDeleteChannel', [toRemove]);
      showConfirmDialog(confirmMessage, () => {
        if (el.disabled) return;
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
      }, null, chrome.i18n.getMessage('confirmDelete'));
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
    const translationProviderEl = document.getElementById('translationProvider');
    const targetLanguageEl = document.getElementById('targetLanguage');
    const customPrefixEl = document.getElementById('customPrefix');
    const useKDisplayEl = document.getElementById('useKDisplay');
    
    if (muteNotificationsEl) muteNotificationsEl.checked = !!s.muteNotifications;
    if (hideOfflineEl) hideOfflineEl.checked = s.hideOffline !== false;
    if (hidePreviewsEl) hidePreviewsEl.checked = !!s.hidePreviews;
    if (pollMinutesEl) pollMinutesEl.value = Number(s.pollMinutes || 1);
    if (autoFollowEl) autoFollowEl.checked = !!s.autoFollow;
    
    if (translationEnabledEl) {
      translationEnabledEl.checked = !!s.translationEnabled;
    }
    if (translationProviderEl) {
      translationProviderEl.value = s.translationProvider || 'microsoft';
    }
    if (targetLanguageEl) {
      targetLanguageEl.value = s.targetLanguage || 'en';
    }
    if (customPrefixEl) {
      customPrefixEl.value = s.customPrefix || '';
    }
    if (useKDisplayEl) {
      useKDisplayEl.checked = s.useKDisplay === true;
    }
    
    viewerCountSettings.useKDisplay = s.useKDisplay === true;
    
    pollInterval = Number(s.pollMinutes || 1) * 60;
    
    updateManualChannelVisibility(!!s.autoFollow);
  });
  
  
  chrome.storage.local.get(['chatTranslationSettings'], (result) => {
    const translationSettings = result.chatTranslationSettings || {};
    const translationEnabledEl = document.getElementById('translationEnabled');
    const translationProviderEl = document.getElementById('translationProvider');
    const targetLanguageEl = document.getElementById('targetLanguage');
    const customPrefixEl = document.getElementById('customPrefix');
    
    if (translationEnabledEl) {
      translationEnabledEl.checked = translationSettings.enabled !== false;
    }
    if (translationProviderEl) {
      translationProviderEl.value = translationSettings.provider || 'microsoft';
    }
    if (targetLanguageEl) {
      targetLanguageEl.value = translationSettings.language || 'zh-tw';
    }
    if (customPrefixEl) {
      customPrefixEl.value = translationSettings.customPrefix || '';
    }
    
    chatTranslationSettings.enabled = translationSettings.enabled !== false;
    chatTranslationSettings.provider = translationSettings.provider || 'microsoft';
    chatTranslationSettings.language = translationSettings.language || 'zh-tw';
    chatTranslationSettings.customPrefix = translationSettings.customPrefix || '';
    
    chrome.runtime.sendMessage({
      type: 'updateTranslationSettings',
      settings: chatTranslationSettings
    });
  });
}

function updateAllGlobalSettings() {
  const useKDisplayEl = document.getElementById('useKDisplay');
  if (useKDisplayEl) {
    viewerCountSettings.useKDisplay = useKDisplayEl.checked;
  }
  
  const translationEnabledEl = document.getElementById('translationEnabled');
  if (translationEnabledEl) {
    chatTranslationSettings.enabled = translationEnabledEl.checked;
  }
  
  const translationProviderEl = document.getElementById('translationProvider');
  if (translationProviderEl) {
    chatTranslationSettings.provider = translationProviderEl.value;
  }
  
  const targetLanguageEl = document.getElementById('targetLanguage');
  if (targetLanguageEl) {
    chatTranslationSettings.language = targetLanguageEl.value;
  }
  
  const customPrefixEl = document.getElementById('customPrefix');
  if (customPrefixEl) {
    chatTranslationSettings.customPrefix = customPrefixEl.value;
  }
  
  chrome.runtime.sendMessage({
    type: 'updateTranslationSettings',
    settings: chatTranslationSettings
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
  const translationProviderEl = document.getElementById('translationProvider');
  const targetLanguageEl = document.getElementById('targetLanguage');
  const customPrefixEl = document.getElementById('customPrefix');
  const useKDisplayEl = document.getElementById('useKDisplay');
  
  const settings = {
    muteNotifications: muteNotificationsEl ? muteNotificationsEl.checked : false,
    hideOffline: hideOfflineEl ? hideOfflineEl.checked : true,
    hidePreviews: hidePreviewsEl ? hidePreviewsEl.checked : false,
    pollMinutes: pollMinutesEl ? Number(pollMinutesEl.value || 1) : 1,
    autoFollow: autoFollowEl ? autoFollowEl.checked : false,
    translationEnabled: translationEnabledEl ? translationEnabledEl.checked : false,
    translationProvider: translationProviderEl ? translationProviderEl.value : 'microsoft',
    targetLanguage: targetLanguageEl ? targetLanguageEl.value : 'en',
    customPrefix: customPrefixEl ? customPrefixEl.value : '',
    useKDisplay: useKDisplayEl ? useKDisplayEl.checked : false
  };
  
  viewerCountSettings.useKDisplay = settings.useKDisplay;
  chatTranslationSettings.enabled = settings.translationEnabled;
  chatTranslationSettings.provider = settings.translationProvider;
  chatTranslationSettings.language = settings.targetLanguage;
  chatTranslationSettings.customPrefix = settings.customPrefix;
  
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
          provider: settings.translationProvider,
          language: settings.targetLanguage,
          customPrefix: formattedCustomPrefix
        }
      });
      
      chrome.runtime.sendMessage({
        type: 'updateTranslationSettings',
        settings: chatTranslationSettings
      });
      
      if (settings.autoFollow) {
        console.log('Auto-follow enabled, triggering immediate fetch...');
        chrome.runtime.sendMessage({ type: 'test:autoFollow' }, (fetchResponse) => {
          if (chrome.runtime.lastError) {
            console.log('Error triggering auto-follow after settings save:', chrome.runtime.lastError.message);
          } else if (fetchResponse?.ok) {
            console.log('Auto-follow triggered successfully after settings save');
            loadChannels();
            
            const currentTab = document.querySelector('.tab-btn.active');
            if (currentTab && currentTab.id === 'channelsTab') {
              renderChannelsList();
            }
          } else {
            console.log('Auto-follow failed after settings save:', fetchResponse?.error);
          }
        });
      } else {
        chrome.runtime.sendMessage({ type: 'streams:list' }, async (res2) => {
          if (!chrome.runtime.lastError && res2?.payload) {
            const settingsRes = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: 'settings:get' }, (res) => {
                resolve(res);
              });
            });
            await renderStreamList(res2.payload, settingsRes?.settings || {});
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

  if (!settings || Object.keys(settings).length === 0) {
    const settingsRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'settings:get' }, (res) => {
        resolve(res);
      });
    });
    settings = settingsRes?.settings || {};
  }

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

  const hideOffline = settings?.hideOffline !== false;
  if (liveStreams.length === 0) {
    emptyState.classList.remove('hidden');
    const noStreamsText = chrome.i18n.getMessage('noStreams');
    statusBar.textContent = noStreamsText;
    
    const settingsStatus = document.getElementById('settingsStatus');
    if (settingsStatus) {
      settingsStatus.textContent = noStreamsText;
      settingsStatus.className = 'status success';
    }
    
    if (offlineStreams.length > 0 && !hideOffline) {
      const existingOfflineSection = streamList.querySelector('.offline-section');
      updateOfflineSection(streamList, existingOfflineSection, offlineStreams, settings);
    }
    setupStreamTitleTooltips();
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

  await new Promise((resolve) => {
    chrome.storage.local.get(['tsn_favorites'], async (obj) => {
      const favMap = obj?.tsn_favorites || {};
      const isFav = (login) => !!favMap[String(login || '').toLowerCase()];
      const favLive = sortedLiveStreams.filter(s => isFav(s.username || s.channel?.display_name || ''));
      const otherLive = sortedLiveStreams.filter(s => !isFav(s.username || s.channel?.display_name || ''));

      const allLiveStreams = [...favLive, ...otherLive];
      const existingItems = Array.from(streamList.querySelectorAll('li:not(.fav-separator)'));
      
      await updateLiveStreamItems(streamList, existingItems, allLiveStreams, settings);
      
      if (favLive.length > 0 && otherLive.length > 0) {
        const existingSep = streamList.querySelector('.fav-separator');
        if (!existingSep) {
        const sep = document.createElement('li');
        sep.className = 'fav-separator';
        sep.style.cssText = 'height:8px';
          const firstOtherItem = streamList.querySelector(`[data-username="${otherLive[0]?.username}"]`);
          if (firstOtherItem) {
            streamList.insertBefore(sep, firstOtherItem);
          } else {
        streamList.appendChild(sep);
      }
        }
      } else {
        const existingSep = streamList.querySelector('.fav-separator');
        if (existingSep) {
          existingSep.remove();
        }
      }

      const existingOfflineSection = streamList.querySelector('.offline-section');
      updateOfflineSection(streamList, existingOfflineSection, sortedOfflineStreams, settings);
      setupStreamTitleTooltips();
      resolve();
    });
  });
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


async function translateText(text, targetLanguage, provider = 'microsoft') {
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
  if (!streamList) {
    return;
  }
  
  const existingItems = Array.from(streamList.children);
  const existingLiveItems = existingItems.filter(item => !item.classList.contains('offline-section'));
  const existingOfflineSection = existingItems.find(item => item.classList.contains('offline-section'));
  
  await updateLiveStreamItems(streamList, existingLiveItems, liveStreams, settings);
  
  updateOfflineSection(streamList, existingOfflineSection, offlineStreams, settings);
}

async function updateLiveStreamItems(streamList, existingItems, liveStreams, settings) {
  if (!liveStreams || !Array.isArray(liveStreams)) {
    return;
  }
  
  const itemMap = new Map();
  existingItems.forEach(item => {
    const username = item.getAttribute('data-username');
    if (username) {
      itemMap.set(username, item);
    }
  });
  
  const currentUsernames = new Set();
  
  for (const [index, stream] of liveStreams.entries()) {
    const username = stream.username || stream.channel?.display_name;
    currentUsernames.add(username);
    let item = itemMap.get(username);
    
    if (item) {
      updateStreamItemContent(item, stream, settings);
    } else {
      item = await createStreamItem(stream, settings);
      item.setAttribute('data-username', username);
      
      const insertIndex = Math.min(index, streamList.children.length);
      const insertBefore = streamList.children[insertIndex];
      if (insertBefore) {
        streamList.insertBefore(item, insertBefore);
      } else {
        streamList.appendChild(item);
      }
    }
  }
  
  existingItems.forEach(item => {
    const username = item.getAttribute('data-username');
    if (username && !currentUsernames.has(username)) {
      item.remove();
    }
  });
}

function updateStreamItemContent(item, stream, settings) {
  const img = item.querySelector('.stream-thumbnail img');
  if (img) {
    const newUrl = getPreviewUrl(stream.username, 640, 360) + `?t=${Date.now()}`;
    if (img.dataset.pendingSrc === newUrl || img.src === newUrl) {
    } else {
      img.dataset.pendingSrc = newUrl;
      const preloader = new Image();
      preloader.onload = () => {
        if (img.dataset.pendingSrc === newUrl) {
          img.src = newUrl;
          img.style.opacity = '0.999';
          requestAnimationFrame(() => { img.style.opacity = ''; });
          delete img.dataset.pendingSrc;
        }
      };
      preloader.src = newUrl;
    }
  }
  
  const title = item.querySelector('.stream-title');
  if (title) {
    title.textContent = stream.channel.status;
    title.setAttribute('data-full', (stream.channel.status || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
  }
  
  const gameName = item.querySelector('.game-name');
  if (gameName) {
    if (stream.game) {
      gameName.textContent = stream.game;
      gameName.style.display = '';
    } else {
      gameName.style.display = 'none';
    }
  }
  
  const avatar = item.querySelector('.streamer-avatar');
  if (avatar && stream.channel.profile_image_url) {
    avatar.src = stream.channel.profile_image_url;
    avatar.alt = stream.channel.display_name;
  }
  
  const viewerCount = item.querySelector('.viewer-count');
  if (viewerCount) {
    viewerCount.textContent = formatViewerCount(stream.viewers || 0);
  }
  
  const timeBadge = item.querySelector('.live-time-badge');
  if (timeBadge && stream.created_at) {
    const newTime = formatStreamTime(stream.created_at);
    if (timeBadge.textContent !== newTime) {
      timeBadge.textContent = newTime;
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
    item.setAttribute('data-username', stream.username || stream.channel?.display_name);
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
    removeBtn.textContent = '×';
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
    
  const thumbnailUrl = getPreviewUrl(stream.username, 640, 360) + `?t=${Date.now()}`;
      const thumbnailHtml = settings.hidePreviews ? '' : `
        <div class=\"stream-thumbnail\" style=\"position: relative;\">
          <img src=\"${thumbnailUrl}\" alt=\"${stream.username} stream\" />
          <span class=\"live-time-badge\">${formatStreamTime(stream.created_at)}</span>
        </div>
      `;

  
  const displayTitle = stream.channel.status;
  const originalTitle = stream.channel.status;

  const streamContentHtml = `
        <div class="stream-content">
          ${thumbnailHtml}
          <div class="stream-info">
            <div class=\"stream-header\" style=\"display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;\">
              ${stream.channel.profile_image_url ? `<img src=\"${stream.channel.profile_image_url}\" alt=\"${stream.channel.display_name}\" class=\"streamer-avatar\" style=\"width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0;\">` : ''}
              <span class=\"streamer-name\">${stream.channel.display_name}</span>
          </div>
            <div class="stream-title" data-full="${(originalTitle || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" data-translated="${(displayTitle || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">${displayTitle}</div>
            
          <div class="stream-stats">
              <div class="viewer-section" style="gap:8px;">
              <div class="viewer-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill-rule="evenodd" d="M5 7a5 5 0 1 1 6.192 4.857A2 2 0 0 0 13 13h1a3 3 0 0 1 3 3v2h-2v-2a1 1 0 0 0-1-1h-1a3.99 3.99 0 0 1-3-1.354A3.99 3.99 0 0 1 7 15H6a1 1 0 0 0-1 1v2H3v-2a3 3 0 0 1 3-3h1a2 2 0 0 0 1.808-1.143A5.002 5.002 0 0 1 5 7zm5 3a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <strong class="viewer-count">${formatViewerCount(stream.viewers || 0)}</strong>
              <p class="viewer-label">${chrome.i18n.getMessage('viewerCount')}: ${formatViewerCount(stream.viewers || 0)}</p>
                ${stream.game ? `<span class="game-name ${settings.hidePreviews ? 'game-name-full' : ''}">${stream.game}</span>` : ''}
            </div>
              <div class="duration-section" style="display:none"></div>
            </div>
          </div>
        </div>
      `;
  
    const parser = new DOMParser();
    const doc = parser.parseFromString(streamContentHtml, 'text/html');
    const tempDiv = doc.body;
    while (tempDiv.firstChild) {
      item.appendChild(tempDiv.firstChild);
    }
    if (removeBtn) {
      item.appendChild(removeBtn);
    }
  return item;
}

function updateOfflineSection(streamList, existingOfflineSection, offlineStreams, settings) {
  const hideOffline = settings?.hideOffline !== false;
  
  if (offlineStreams && offlineStreams.length > 0 && !hideOffline) {
    if (existingOfflineSection) {
      const offlineGrid = existingOfflineSection.querySelector('.offline-grid');
      const title = existingOfflineSection.querySelector('.offline-title');
      
      if (title) {
        title.textContent = chrome.i18n.getMessage('offlineStreamers', [offlineStreams.length]);
      }
      
      if (offlineGrid) {
        updateOfflineStreamItems(offlineGrid, offlineStreams, settings);
      }
    } else {
  const offlineSection = createOfflineSection(offlineStreams, settings);
      streamList.appendChild(offlineSection);
    }
  } else if (existingOfflineSection) {
  existingOfflineSection.remove();
  }
}

function updateOfflineStreamItems(offlineGrid, offlineStreams, settings) {
  if (!offlineGrid || !offlineStreams || !Array.isArray(offlineStreams)) {
    return;
  }
  
  const existingItems = Array.from(offlineGrid.children);
  const itemMap = new Map();
  
  existingItems.forEach(item => {
    const username = item.getAttribute('data-username');
    if (username) {
      itemMap.set(username, item);
    }
  });
  
  offlineStreams.forEach((stream, index) => {
    const username = stream.username;
    let item = itemMap.get(username);
    
    if (!item) {
      item = createOfflineStreamItem(stream, settings);
      offlineGrid.insertBefore(item, existingItems[index] || null);
    }
  });
  
  const currentUsernames = new Set(offlineStreams.map(s => s.username));
  existingItems.forEach(item => {
    const username = item.getAttribute('data-username');
    if (username && !currentUsernames.has(username)) {
      item.remove();
    }
  });
}

function createOfflineSection(offlineStreams, settings) {
  const offlineSection = document.createElement('div');
  offlineSection.className = 'offline-section';
  const offlineHeader = document.createElement('div');
  offlineHeader.className = 'offline-header';
  const offlineTitle = document.createElement('span');
  offlineTitle.className = 'offline-title';
  offlineTitle.textContent = chrome.i18n.getMessage('offlineStreamers', [offlineStreams.length]);
  offlineHeader.appendChild(offlineTitle);
  
  const offlineGrid = document.createElement('div');
  offlineGrid.className = 'offline-grid';
  
  offlineSection.appendChild(offlineHeader);
  offlineSection.appendChild(offlineGrid);
  
  offlineStreams.forEach(stream => {
    const item = createOfflineStreamItem(stream, settings);
    offlineGrid.appendChild(item);
  });
  
  return offlineSection;
}

function createOfflineStreamItem(stream, settings) {
  const item = document.createElement('div');
  item.className = 'offline-card fade-in';
  item.setAttribute('data-username', stream.username);
  item.addEventListener('click', () => {
    const url = `https://www.twitch.tv/${stream.username}`;
    chrome.tabs.create({ url });
  });
  
  let removeBtn = null;
  if (!settings?.autoFollow) {
    removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
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

  const cardContent = document.createElement('div');
  cardContent.className = 'offline-card-content';
  
  const avatar = document.createElement('div');
  avatar.className = 'offline-avatar';
  const avatarPlaceholder = document.createElement('div');
  avatarPlaceholder.className = 'offline-avatar-placeholder';
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '7');
  circle.setAttribute('r', '4');
  
  svg.appendChild(path1);
  svg.appendChild(circle);
  avatarPlaceholder.appendChild(svg);
  avatar.appendChild(avatarPlaceholder);
  
  const info = document.createElement('div');
  info.className = 'offline-info';
  
  const name = document.createElement('div');
  name.className = 'offline-name';
  name.textContent = stream.username;
  
  const status = document.createElement('div');
  status.className = 'offline-status';
  status.textContent = chrome.i18n.getMessage('offline');
  
  info.appendChild(name);
  info.appendChild(status);
  
  cardContent.appendChild(avatar);
  cardContent.appendChild(info);
  item.appendChild(cardContent);
  if (removeBtn) {
    item.appendChild(removeBtn);
  }
  return item;
}

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('empty').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');
  const streamList = document.getElementById('streamList');
  while (streamList.firstChild) {
    streamList.removeChild(streamList.firstChild);
  }
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
        updateAllGlobalSettings();
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

function showChannelsLoading() {
  const channelsLoading = document.getElementById('channelsLoading');
  const channelsEmpty = document.getElementById('channelsEmpty');
  const channelsError = document.getElementById('channelsError');
  const channelsList = document.getElementById('channelsList');
  
  if (channelsLoading) channelsLoading.classList.remove('hidden');
  if (channelsEmpty) channelsEmpty.classList.add('hidden');
  if (channelsError) channelsError.classList.add('hidden');
  
  while (channelsList.firstChild) {
    channelsList.removeChild(channelsList.firstChild);
  }
}

function showChannelsEmpty() {
  const channelsLoading = document.getElementById('channelsLoading');
  const channelsEmpty = document.getElementById('channelsEmpty');
  const channelsError = document.getElementById('channelsError');
  const channelsList = document.getElementById('channelsList');
  
  if (channelsLoading) channelsLoading.classList.add('hidden');
  if (channelsEmpty) channelsEmpty.classList.remove('hidden');
  if (channelsError) channelsError.classList.add('hidden');
  
  while (channelsList.firstChild) {
    channelsList.removeChild(channelsList.firstChild);
  }
}

function showChannelsError(message) {
  const channelsLoading = document.getElementById('channelsLoading');
  const channelsEmpty = document.getElementById('channelsEmpty');
  const channelsError = document.getElementById('channelsError');
  const channelsErrorMessage = document.getElementById('channelsErrorMessage');
  const channelsList = document.getElementById('channelsList');
  
  if (channelsLoading) channelsLoading.classList.add('hidden');
  if (channelsEmpty) channelsEmpty.classList.add('hidden');
  if (channelsError) channelsError.classList.remove('hidden');
  
  if (channelsErrorMessage && message) {
    channelsErrorMessage.textContent = message;
  }
  
  while (channelsList.firstChild) {
    channelsList.removeChild(channelsList.firstChild);
  }
}

function renderChannelsList() {
  showChannelsLoading();
  
  chrome.runtime.sendMessage({ type: 'streams:list' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Error loading channels for management:', chrome.runtime.lastError.message);
      showChannelsError(chrome.runtime.lastError.message);
      return;
    }
    
    const channelsList = document.getElementById('channelsList');
    const channelsStatus = document.getElementById('channelsStatus');
    const channelsLastUpdate = document.getElementById('channelsLastUpdate');
    
    if (!response?.payload || response.payload.length === 0) {
      showChannelsEmpty();
      
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
            userMap[login] = { 
              description: entry.desc,
              profile_image_url: entry.profile_image_url || ''
            };
          } else {
            missing.push(login);
          }
        });

        const renderWith = (map) => {
          chrome.storage.local.get(['tsn_favorites'], (favObj) => {
            const fav = favObj?.tsn_favorites || {};
            const isFav = (login) => !!fav[String(login || '').toLowerCase()];
            
            const favChannels = response.payload.filter(channel => isFav(channel.username));
            const otherChannels = response.payload.filter(channel => !isFav(channel.username));
            
            const createChannelHTML = (channel) => {
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
          const diffMs = now - followedDate;
          const msPerDay = 24 * 60 * 60 * 1000;
          const totalDays = Math.max(0, Math.floor(diffMs / msPerDay));
          const years = Math.floor(totalDays / 365);
          const days = totalDays % 365;
          if (years > 0) {
            followDisplay = days > 0
              ? chrome.i18n.getMessage('followAgeYearsDays', [years, days])
              : chrome.i18n.getMessage('followAgeYearsOnly', [years]);
          } else if (totalDays > 0) {
            followDisplay = chrome.i18n.getMessage('followAgeDaysOnly', [totalDays]);
          } else {
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const msg = chrome.i18n.getMessage('followAgeHoursMinutes', [hours, minutes]);
            if (msg) {
              followDisplay = msg;
            } else {
              followDisplay = `${chrome.i18n.getMessage('followingFor') || 'Following for'} ${hours}${chrome.i18n.getMessage('hours')}${minutes}${chrome.i18n.getMessage('minutes')}`;
            }
          }
          followTitle = followedDate.toLocaleString(navigator.language);
        }
        
          const nameLine = (displayName && displayName.toLowerCase() !== String(login).toLowerCase())
            ? `${displayName} (${login})`
            : login;

              return `
              <div class="channel-item fade-in" data-channel-id="${login}" style="position: relative;">
            <div class="channel-header" style="position: relative; padding-right: 24px;">
              <div class="channel-name" style="display: flex; align-items: center; gap: 8px;">
                ${uinfo.profile_image_url ? `<img src="${uinfo.profile_image_url}" alt="${displayName}" class="channel-avatar" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid var(--border-light);">` : ''}
                <span>${nameLine}</span>
                    <button class="btn-fav" data-channel-id="${login}" style="position:absolute; right:4px; top:50%; transform: translateY(-50%); width:24px; height:24px; padding:0; background:rgba(0,0,0,0.6); border:none; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; visibility:hidden; transition:all 0.2s ease; backdrop-filter:blur(8px);">
                      <svg class="fav-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:all 0.2s ease;">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </button>
              </div>
            </div>
            <div class="channel-details">
              ${description ? `<div class="channel-desc" data-full="${description.replace(/\\/g, '\\\\').replace(/\n/g, '&#10;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">${description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
              <span class="follow-age" data-full="${followTitle}">${followDisplay}</span>
            </div>
			
            <div class="channel-footer">
            <div class="channel-notification">
              <span class="notification-label">${chrome.i18n.getMessage('enableNotifications')}</span>
              <label class="toggle-switch">
                <input type="checkbox" ${isNotificationEnabled ? 'checked' : ''} 
                       data-channel-id="${login}">
                <span class="toggle-slider"></span>
              </label>
            </div>
              <hr class="channel-hr"><div class="channel-actions">
                <button class="btn-go-channel" data-channel-id="${login}" data-channel-name="${displayName}" title="${chrome.i18n.getMessage('goToChannel') || 'Go to channel'}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12h13"></path><path d="m11 18 6-6-6-6"></path>
                  </svg>
                  ${chrome.i18n.getMessage('goToChannel') || 'Go to channel'}
                </button>
                <button class="btn-vod" data-channel-id="${login}" data-channel-name="${displayName}" title="${chrome.i18n.getMessage('viewVods') || 'View VODs'}">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                  ${chrome.i18n.getMessage('vodsShort') || 'VODs'}
              </button>
              </div>
            </div>
          </div>
          `;
            };
            
            let html = '';
            
            favChannels.forEach(channel => {
              html += createChannelHTML(channel);
            });
            
            if (favChannels.length > 0 && otherChannels.length > 0) {
              html += '<div style="grid-column:1 / -1; height:8px;"></div>';
            }
            
            otherChannels.forEach(channel => {
              html += createChannelHTML(channel);
            });
            
            const existingItems = Array.from(channelsList.querySelectorAll('.channel-item'));
            const existingChannelIds = new Set(existingItems.map(item => item.getAttribute('data-channel-id')));
            const newChannelIds = new Set([...favChannels, ...otherChannels].map(c => c.username));
            
            if (existingChannelIds.size === 0 || !Array.from(existingChannelIds).every(id => newChannelIds.has(id))) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');
              const tempDiv = doc.body;
              while (channelsList.firstChild) {
                channelsList.removeChild(channelsList.firstChild);
              }
              while (tempDiv.firstChild) {
                channelsList.appendChild(tempDiv.firstChild);
              }
            }
            
            const channelsLoading = document.getElementById('channelsLoading');
            const channelsEmpty = document.getElementById('channelsEmpty');
            const channelsError = document.getElementById('channelsError');
            
            if (channelsLoading) channelsLoading.classList.add('hidden');
            if (channelsEmpty) channelsEmpty.classList.add('hidden');
            if (channelsError) channelsError.classList.add('hidden');
            
            const items = Array.from(channelsList.querySelectorAll('.channel-item'));
            items.forEach(it => {
              const btn = it.querySelector('.btn-fav');
              const icon = it.querySelector('.btn-fav .fav-icon');
              const id = String(it.getAttribute('data-channel-id') || '').toLowerCase();
              if (btn && icon) {
                if (fav[id]) { 
                  btn.style.background = 'rgba(239, 68, 68, 0.9)';
                  icon.style.fill = '#ffffff';
                  icon.style.stroke = '#ffffff';
                } else { 
                  btn.style.background = 'rgba(0,0,0,0.6)';
                  icon.style.fill = 'none';
                  icon.style.stroke = '#ffffff';
                }
              }
            });
          });
      };

        renderWith(userMap);

        if (missing.length > 0) {
          chrome.runtime.sendMessage({ type: 'users:getInfoBatch', logins: missing }, (usersRes) => {
            const fetched = usersRes?.users || {};
            const nextCache = { ...cache };
            Object.keys(fetched).forEach(login => {
              nextCache[login] = { 
                desc: fetched[login].description || '', 
                profile_image_url: fetched[login].profile_image_url || '',
                ts: Date.now() 
              };
              userMap[login] = { 
                description: fetched[login].description || '',
                profile_image_url: fetched[login].profile_image_url || ''
              };
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

  function reorderFavoritesInChannels() {
    chrome.storage.local.get(['tsn_favorites'], (obj) => {
      const fav = obj?.tsn_favorites || {};
      const list = document.getElementById('channelsList');
      if (!list) return;
      const items = Array.from(list.querySelectorAll('.channel-item'));
      const favItems = items.filter(it => fav[String(it.getAttribute('data-channel-id') || '').toLowerCase()]);
      const otherItems = items.filter(it => !fav[String(it.getAttribute('data-channel-id') || '').toLowerCase()]);
      if (favItems.length === 0) return;
      while (list.firstChild) list.removeChild(list.firstChild);
      favItems.forEach(it => list.appendChild(it));
      if (otherItems.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = 'grid-column:1 / -1; height:8px;';
        list.appendChild(sep);
      }
      otherItems.forEach(it => list.appendChild(it));
      items.forEach(it => {
        const btn = it.querySelector('.btn-fav .fav-icon');
        const id = String(it.getAttribute('data-channel-id') || '').toLowerCase();
        if (btn) {
          if (fav[id]) { btn.style.fill = '#ef4444'; btn.style.stroke = '#ef4444'; }
          else { btn.style.fill = 'none'; btn.style.stroke = '#ffffff'; }
        }
      });
    });
  }

  const channelsListEl = document.getElementById('channelsList');
  if (channelsListEl) {
    channelsListEl.addEventListener('mouseover', (e) => {
      const btn = e.target.closest && e.target.closest('.btn-fav');
      if (btn) {
        const icon = btn.querySelector('.fav-icon');
        const id = String(btn.getAttribute('data-channel-id') || '').toLowerCase();
        chrome.storage.local.get(['tsn_favorites'], (obj) => {
          const fav = obj?.tsn_favorites || {};
          if (icon) {
            if (fav[id]) {
              btn.style.transform = 'translateY(-50%) scale(1.1)';
              btn.style.background = 'rgba(239, 68, 68, 1)';
            } else {
              btn.style.background = 'rgba(239, 68, 68, 0.8)';
              btn.style.transform = 'translateY(-50%) scale(1.05)';
              icon.style.stroke = '#ffffff';
            }
          }
        });
      }
    });
    channelsListEl.addEventListener('mouseout', (e) => {
      const btn = e.target.closest && e.target.closest('.btn-fav');
      if (btn) {
        const icon = btn.querySelector('.fav-icon');
        const id = String(btn.getAttribute('data-channel-id') || '').toLowerCase();
        chrome.storage.local.get(['tsn_favorites'], (obj) => {
          const fav = obj?.tsn_favorites || {};
          if (icon) {
            if (fav[id]) { 
              btn.style.background = 'rgba(239, 68, 68, 0.9)';
              icon.style.fill = '#ffffff';
              icon.style.stroke = '#ffffff';
            } else { 
              btn.style.background = 'rgba(0,0,0,0.6)';
              icon.style.fill = 'none';
              icon.style.stroke = '#ffffff';
            }
            btn.style.transform = 'translateY(-50%) scale(1)';
          }
        });
      }
    });
  }

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
  
      channelsList.addEventListener('mouseover', (e) => {
        const item = e.target.closest('.channel-item');
        if (item) {
          const btn = item.querySelector('.btn-fav');
          if (btn) { 
            btn.style.opacity = '1'; 
            btn.style.visibility = 'visible'; 
          }
        }
      });
      channelsList.addEventListener('mouseout', (e) => {
        const from = e.target.closest('.channel-item');
        const to = e.relatedTarget?.closest?.('.channel-item');
        if (from && from !== to) {
          const btn = from.querySelector('.btn-fav');
          if (btn) { 
            btn.style.opacity = '0'; 
            btn.style.visibility = 'hidden'; 
          }
        }
      });
      channelsList.addEventListener('click', (e) => {
    if (e.target.closest('.btn-vod')) {
      e.stopPropagation();
      const button = e.target.closest('.btn-vod');
      const channelId = button.getAttribute('data-channel-id');
      const channelName = button.getAttribute('data-channel-name');
      showVodModal(channelId, channelName);
        } else if (e.target.closest('.btn-go-channel')) {
      e.stopPropagation();
      const button = e.target.closest('.btn-go-channel');
      const channelId = button.getAttribute('data-channel-id');
      const href = `https://www.twitch.tv/${channelId}`;
        chrome.tabs.create({ url: href });
        } else if (e.target.closest('.btn-fav')) {
          e.stopPropagation();
          const btn = e.target.closest('.btn-fav');
          const id = String(btn.getAttribute('data-channel-id') || '').toLowerCase();
          
          btn.style.transform = 'translateY(-50%) scale(0.95)';
          
          setTimeout(() => {
          chrome.storage.local.get(['tsn_favorites'], (obj) => {
            const fav = obj?.tsn_favorites || {};
            fav[id] = fav[id] ? false : true;
            if (!fav[id]) delete fav[id];
            chrome.storage.local.set({ tsn_favorites: fav }, () => {
              const icon = btn.querySelector('.fav-icon');
              if (icon) {
                if (fav[id]) { 
                  btn.style.background = 'rgba(239, 68, 68, 0.9)';
                  icon.style.fill = '#ffffff';
                  icon.style.stroke = '#ffffff';
                } else { 
                  btn.style.background = 'rgba(0,0,0,0.6)';
                  icon.style.fill = 'none';
                  icon.style.stroke = '#ffffff';
                }
              }
              refresh();
                
                setTimeout(() => {
                  btn.style.transform = 'translateY(-50%) scale(1)';
                }, 100);
            });
          });
          }, 100);
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
      
      const currentTab = document.querySelector('.tab-btn.active');
      if (currentTab && currentTab.id === 'channelsTab') {
        renderChannelsList();
      }
    } else {
      showStatus(chrome.i18n.getMessage('addChannelFailed'), 'error');
    }
  });
});

        document.getElementById('authorizeBtn').addEventListener('click', () => {
          const btn = document.getElementById('authorizeBtn');
          btn.disabled = true;
          while (btn.firstChild) {
            btn.removeChild(btn.firstChild);
          }
          const authSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          authSvg.setAttribute('width', '12');
          authSvg.setAttribute('height', '12');
          authSvg.setAttribute('viewBox', '0 0 24 24');
          authSvg.setAttribute('fill', 'none');
          authSvg.setAttribute('stroke', 'currentColor');
          authSvg.setAttribute('stroke-width', '2');
          authSvg.setAttribute('stroke-linecap', 'round');
          authSvg.setAttribute('stroke-linejoin', 'round');
          authSvg.style.cssText = 'margin-right: 4px; animation: spin 1s linear infinite;';
          
          const authPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          authPath.setAttribute('d', 'M21 12a9 9 0 11-6.219-8.56');
          authSvg.appendChild(authPath);
          btn.appendChild(authSvg);
          btn.appendChild(document.createTextNode(chrome.i18n.getMessage('authorizing')));
          
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
              promptEnableAutoFollow();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });

        document.getElementById('headerAuthBtn').addEventListener('click', () => {
          const btn = document.getElementById('headerAuthBtn');
          btn.disabled = true;
          while (btn.firstChild) {
            btn.removeChild(btn.firstChild);
          }
          const authSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          authSvg.setAttribute('width', '12');
          authSvg.setAttribute('height', '12');
          authSvg.setAttribute('viewBox', '0 0 24 24');
          authSvg.setAttribute('fill', 'none');
          authSvg.setAttribute('stroke', 'currentColor');
          authSvg.setAttribute('stroke-width', '2');
          authSvg.setAttribute('stroke-linecap', 'round');
          authSvg.setAttribute('stroke-linejoin', 'round');
          authSvg.style.cssText = 'margin-right: 4px; animation: spin 1s linear infinite;';
          
          const authPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          authPath.setAttribute('d', 'M21 12a9 9 0 11-6.219-8.56');
          authSvg.appendChild(authPath);
          btn.appendChild(authSvg);
          btn.appendChild(document.createTextNode(chrome.i18n.getMessage('authorizing')));
          
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
              promptEnableAutoFollow();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });

        document.getElementById('headerAuthBtn2').addEventListener('click', () => {
          const btn = document.getElementById('headerAuthBtn2');
          btn.disabled = true;
          while (btn.firstChild) {
            btn.removeChild(btn.firstChild);
          }
          const authSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          authSvg.setAttribute('width', '12');
          authSvg.setAttribute('height', '12');
          authSvg.setAttribute('viewBox', '0 0 24 24');
          authSvg.setAttribute('fill', 'none');
          authSvg.setAttribute('stroke', 'currentColor');
          authSvg.setAttribute('stroke-width', '2');
          authSvg.setAttribute('stroke-linecap', 'round');
          authSvg.setAttribute('stroke-linejoin', 'round');
          authSvg.style.cssText = 'margin-right: 4px; animation: spin 1s linear infinite;';
          
          const authPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          authPath.setAttribute('d', 'M21 12a9 9 0 11-6.219-8.56');
          authSvg.appendChild(authPath);
          btn.appendChild(authSvg);
          btn.appendChild(document.createTextNode(chrome.i18n.getMessage('authorizing')));
          
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
              promptEnableAutoFollow();
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('authorizationFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });

        document.getElementById('testAutoFollow').addEventListener('click', () => {
          const btn = document.getElementById('testAutoFollow');
          btn.disabled = true;
          while (btn.firstChild) {
            btn.removeChild(btn.firstChild);
          }
          const fetchSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          fetchSvg.setAttribute('width', '12');
          fetchSvg.setAttribute('height', '12');
          fetchSvg.setAttribute('viewBox', '0 0 24 24');
          fetchSvg.setAttribute('fill', 'none');
          fetchSvg.setAttribute('stroke', 'currentColor');
          fetchSvg.setAttribute('stroke-width', '2');
          fetchSvg.setAttribute('stroke-linecap', 'round');
          fetchSvg.setAttribute('stroke-linejoin', 'round');
          fetchSvg.style.cssText = 'margin-right: 4px; animation: spin 1s linear infinite;';
          
          const fetchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          fetchPath.setAttribute('d', 'M21 12a9 9 0 11-6.219-8.56');
          fetchSvg.appendChild(fetchPath);
          btn.appendChild(fetchSvg);
          btn.appendChild(document.createTextNode(chrome.i18n.getMessage('fetching')));
          
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
              
              const currentTab = document.querySelector('.tab-btn.active');
              if (currentTab && currentTab.id === 'channelsTab') {
                renderChannelsList();
              }
            } else {
              showStatus(`❌ ${chrome.i18n.getMessage('fetchFailed', [response?.error || chrome.i18n.getMessage('unknown')])}`, 'error');
            }
          });
        });





function showChoiceDialog(title, message, confirmText, onConfirm, onCancel, cancelText = null) {
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
    max-width: 320px;
    width: 90%;
    box-shadow: var(--shadow-strong);
  `;
  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = 'margin-bottom: var(--spacing-md);';
  
  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: var(--spacing-sm);';
  titleDiv.textContent = title;
  
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = 'font-size: 14px; color: var(--text-secondary); line-height: 1.5;';
  if (message && typeof message === 'string' && message.indexOf('<br>') !== -1) {
    const parts = message.split('<br>');
    parts.forEach((part, index) => {
      if (index > 0) {
        messageDiv.appendChild(document.createElement('br'));
      }
      messageDiv.appendChild(document.createTextNode(part));
    });
  } else {
    messageDiv.textContent = message;
  }
  
  contentDiv.appendChild(titleDiv);
  contentDiv.appendChild(messageDiv);
  
  const buttonDiv = document.createElement('div');
  buttonDiv.style.cssText = 'display: flex; gap: var(--spacing-sm); justify-content: flex-end;';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'choiceCancel';
  cancelBtn.style.cssText = 'padding: 8px 16px; background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; font-weight: 500;';
  cancelBtn.textContent = cancelText || chrome.i18n.getMessage('cancel') || 'Cancel';
  
  const okBtn = document.createElement('button');
  okBtn.id = 'choiceOk';
  okBtn.style.cssText = 'padding: 8px 16px; background: #7c3aed; color: white; border: 1px solid #7c3aed; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; font-weight: 600;';
  okBtn.textContent = confirmText;
  
  buttonDiv.appendChild(cancelBtn);
  buttonDiv.appendChild(okBtn);
  
  dialog.appendChild(contentDiv);
  dialog.appendChild(buttonDiv);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const cancelBtnEl = dialog.querySelector('#choiceCancel');
  const okBtnEl = dialog.querySelector('#choiceOk');
  const cleanup = () => { document.body.removeChild(overlay); };
  cancelBtnEl.addEventListener('click', () => { cleanup(); if (onCancel) onCancel(); });
  okBtnEl.addEventListener('click', () => { cleanup(); if (onConfirm) onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); } });
}

function enableAutoFollowSetting() {
  const autoFollowEl = document.getElementById('autoFollow');
  if (autoFollowEl) autoFollowEl.checked = true;
  saveSettings();
  try { chrome.storage.local.set({ autoFollowPromptCompleted: true }); } catch (_) {}
}

function promptEnableAutoFollow() {
  const title = chrome.i18n.getMessage('autoFollowPromptTitle') || 'Enable Auto Tracking?';
  const message = chrome.i18n.getMessage('autoFollowPromptMessage') || 'When enabled, it will automatically sync streamers you follow on your Twitch account';
  const confirmText = chrome.i18n.getMessage('enableAction') || 'Enable';
  showChoiceDialog(title, message, confirmText, enableAutoFollowSetting, () => {
    try { chrome.storage.local.set({ autoFollowPromptCompleted: true }); } catch (_) {}
  });
}
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
  
  const contentDiv2 = document.createElement('div');
  contentDiv2.style.cssText = 'margin-bottom: var(--spacing-md);';
  
  const titleDiv2 = document.createElement('div');
  titleDiv2.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: var(--spacing-sm);';
  titleDiv2.textContent = chrome.i18n.getMessage('deleteAllChannels');
  
  const messageDiv2 = document.createElement('div');
  messageDiv2.style.cssText = 'font-size: 14px; color: var(--text-secondary); line-height: 1.5;';
  if (message && typeof message === 'string' && message.indexOf('<br>') !== -1) {
    const parts = message.split('<br>');
    parts.forEach((part, index) => {
      if (index > 0) {
        messageDiv2.appendChild(document.createElement('br'));
      }
      messageDiv2.appendChild(document.createTextNode(part));
    });
  } else {
    const parts = message.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) {
        messageDiv2.appendChild(document.createElement('br'));
      }
      messageDiv2.appendChild(document.createTextNode(part));
    });
  }
  
  contentDiv2.appendChild(titleDiv2);
  contentDiv2.appendChild(messageDiv2);
  
  const buttonDiv2 = document.createElement('div');
  buttonDiv2.style.cssText = 'display: flex; gap: var(--spacing-sm); justify-content: flex-end;';
  
  const cancelBtn2 = document.createElement('button');
  cancelBtn2.id = 'confirmCancel';
  cancelBtn2.style.cssText = 'padding: 8px 16px; background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; font-weight: 500;';
  cancelBtn2.textContent = chrome.i18n.getMessage('cancel') || 'Cancel';
  
  const okBtn2 = document.createElement('button');
  okBtn2.id = 'confirmOk';
  okBtn2.style.cssText = 'padding: 8px 16px; background: #ef4444; color: white; border: 1px solid #ef4444; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; font-weight: 500;';
  okBtn2.textContent = confirmText || chrome.i18n.getMessage('deleteAllChannels');
  
  buttonDiv2.appendChild(cancelBtn2);
  buttonDiv2.appendChild(okBtn2);
  
  dialog.appendChild(contentDiv2);
  dialog.appendChild(buttonDiv2);
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  const cancelBtn2El = dialog.querySelector('#confirmCancel');
  const okBtn2El = dialog.querySelector('#confirmOk');
  
  const cleanup = () => {
    document.body.removeChild(overlay);
  };
  
  cancelBtn2El.addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });
  
  okBtn2El.addEventListener('click', () => {
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
      const settingsElements = ['muteNotifications', 'hideOffline', 'hidePreviews', 'pollMinutes', 'autoFollow', 'translationEnabled', 'translationProvider', 'targetLanguage', 'customPrefix', 'useKDisplay'];
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
              setTimeout(() => {
                refresh();
              }, 100);
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
    });
    
    importFileInput.value = '';
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
  const timeElements = document.querySelectorAll('.live-time-badge');
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
  
}

let timeUpdateInterval;
let countdownInterval;
  let autoRefreshInterval;

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

function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  autoRefreshInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'streams:list' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Error refreshing streams:', chrome.runtime.lastError.message);
        return;
      }
      if (response?.payload) {
        const streamList = document.getElementById('streamsContainer');
        if (streamList) {
          const liveStreams = response.payload || [];
          const offlineStreams = response.offlineStreams || [];
          updateStreamList(streamList, liveStreams, offlineStreams, null);
        }
      }
    });
  }, 10000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
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
  
  console.log('i18n function called, browser language:', browserLang);
  
  const elements = document.querySelectorAll('[data-i18n]');
  console.log('Found elements with data-i18n:', elements.length);
  
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    console.log('Key:', key, 'Message:', message, 'Contains <br>:', message && typeof message === 'string' && message.indexOf('<br>') !== -1);
    
    if (message) {
      if (message && typeof message === 'string' && message.indexOf('<br>') !== -1) {
        const parts = message.split('<br>');
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        parts.forEach((part, index) => {
          if (index > 0) {
            element.appendChild(document.createElement('br'));
          }
          element.appendChild(document.createTextNode(part));
        });
      } else {
        element.textContent = message;
      }
    } else {
      console.warn('No message found for key:', key);
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
  loadSettings();
  setTimeout(() => {
    refresh();
  }, 100);
  checkAuthStatus();
  loadUserProfile();
  startTimeUpdates();
  startCountdown();
    startAutoRefresh();
  
  chrome.runtime.sendMessage({ type: 'settings:get' }, (res) => {
    const s = res?.settings || {};
    chrome.storage.local.get(['tsn_access_token','autoFollowPromptCompleted'], (obj) => {
      const hasToken = !!obj.tsn_access_token || !!s.accessToken;
      const autoFollowEnabled = !!s.autoFollow;
      const alreadyCompleted = obj.autoFollowPromptCompleted === true;
      if (hasToken && !autoFollowEnabled && !alreadyCompleted) {
        promptEnableAutoFollow();
      }
    });
  });

  const refreshBtn = document.getElementById('refreshChannels');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.disabled = true;
      while (refreshBtn.firstChild) {
        refreshBtn.removeChild(refreshBtn.firstChild);
      }
      const refreshSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      refreshSvg.setAttribute('width', '14');
      refreshSvg.setAttribute('height', '14');
      refreshSvg.setAttribute('viewBox', '0 0 24 24');
      refreshSvg.setAttribute('fill', 'none');
      refreshSvg.setAttribute('stroke', 'currentColor');
      refreshSvg.setAttribute('stroke-width', '2');
      refreshSvg.setAttribute('stroke-linecap', 'round');
      refreshSvg.setAttribute('stroke-linejoin', 'round');
      refreshSvg.style.cssText = 'animation: spin 1s linear infinite;';
      
      const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline1.setAttribute('points', '23 4 23 10 17 10');
      const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline2.setAttribute('points', '1 20 1 14 7 14');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'm3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15');
      
      refreshSvg.appendChild(polyline1);
      refreshSvg.appendChild(polyline2);
      refreshSvg.appendChild(path);
      refreshBtn.appendChild(refreshSvg);
      
      const span = document.createElement('span');
      span.textContent = 'Refreshing...';
      refreshBtn.appendChild(span);
      
      refresh();
      
      setTimeout(() => {
        refreshBtn.disabled = false;
        while (refreshBtn.firstChild) {
          refreshBtn.removeChild(refreshBtn.firstChild);
        }
        const refreshSvg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        refreshSvg2.setAttribute('width', '14');
        refreshSvg2.setAttribute('height', '14');
        refreshSvg2.setAttribute('viewBox', '0 0 24 24');
        refreshSvg2.setAttribute('fill', 'none');
        refreshSvg2.setAttribute('stroke', 'currentColor');
        refreshSvg2.setAttribute('stroke-width', '2');
        refreshSvg2.setAttribute('stroke-linecap', 'round');
        refreshSvg2.setAttribute('stroke-linejoin', 'round');
        
        const polyline1_2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline1_2.setAttribute('points', '23 4 23 10 17 10');
        const polyline2_2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline2_2.setAttribute('points', '1 20 1 14 7 14');
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'm3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15');
        
        refreshSvg2.appendChild(polyline1_2);
        refreshSvg2.appendChild(polyline2_2);
        refreshSvg2.appendChild(path2);
        refreshBtn.appendChild(refreshSvg2);
        
        const span2 = document.createElement('span');
        span2.setAttribute('data-i18n', 'refresh');
        span2.textContent = 'Refresh';
        refreshBtn.appendChild(span2);
      }, 2000);
    });
  }
  
  const settingsElements = ['muteNotifications', 'hideOffline', 'hidePreviews', 'pollMinutes', 'autoFollow', 'translationEnabled', 'translationProvider', 'targetLanguage', 'customPrefix', 'useKDisplay'];
  settingsElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', saveSettings);
    }
  });


});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTimeUpdates();
    stopCountdown();
    stopAutoRefresh();
  } else {
    startTimeUpdates();
    startCountdown();
    startAutoRefresh();
  }
});

function showVodModal(channelId, channelName) {
  const existingModal = document.querySelector('.vod-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.className = 'vod-modal';
  const modalContent = document.createElement('div');
  modalContent.className = 'vod-modal-content';
  
  const modalHeader = document.createElement('div');
  modalHeader.className = 'vod-modal-header';
  
  const modalTitle = document.createElement('div');
  modalTitle.className = 'vod-modal-title';
  
  const titleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  titleSvg.setAttribute('width', '16');
  titleSvg.setAttribute('height', '16');
  titleSvg.setAttribute('viewBox', '0 0 24 24');
  titleSvg.setAttribute('fill', 'none');
  titleSvg.setAttribute('stroke', 'currentColor');
  titleSvg.setAttribute('stroke-width', '2');
  titleSvg.setAttribute('stroke-linecap', 'round');
  titleSvg.setAttribute('stroke-linejoin', 'round');
  
  const titlePolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  titlePolygon.setAttribute('points', '23 7 16 12 23 17 23 7');
  const titleRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  titleRect.setAttribute('x', '1');
  titleRect.setAttribute('y', '5');
  titleRect.setAttribute('width', '15');
  titleRect.setAttribute('height', '14');
  titleRect.setAttribute('rx', '2');
  titleRect.setAttribute('ry', '2');
  
  titleSvg.appendChild(titlePolygon);
  titleSvg.appendChild(titleRect);
  modalTitle.appendChild(titleSvg);
  modalTitle.appendChild(document.createTextNode(` ${channelName} - ${chrome.i18n.getMessage('vodsShort') || 'VODs'}`));
  
  const closeBtnEl = document.createElement('button');
  closeBtnEl.className = 'vod-modal-close';
  closeBtnEl.textContent = '×';
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtnEl);
  
  const modalBodyEl = document.createElement('div');
  modalBodyEl.className = 'vod-modal-body';
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'vod-loading';
  
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  
  const loadingText = document.createElement('div');
  loadingText.textContent = chrome.i18n.getMessage('loadingVods') || 'Loading VODs...';
  
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(loadingText);
  modalBodyEl.appendChild(loadingDiv);
  
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBodyEl);
  modal.appendChild(modalContent);
  
  document.body.appendChild(modal);
  
  setTimeout(() => {
    modal.classList.add('open');
  }, 10);
  
  closeBtnEl.addEventListener('click', () => {
    modal.classList.remove('open');
    setTimeout(() => {
      modal.remove();
    }, 400);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      setTimeout(() => {
        modal.remove();
      }, 400);
    }
  });
  const modalBodyEl3 = modal.querySelector('.vod-modal-body');
  if (modalBodyEl3 && !modalBodyEl3.dataset.tooltipBound) {
    modalBodyEl3.dataset.tooltipBound = '1';
    let unifiedTooltipEl = null;
    const ensureUnifiedTooltip = () => {
      if (unifiedTooltipEl) return unifiedTooltipEl;
      const el = document.createElement('div');
      el.style.cssText = [
        'position: absolute',
        'z-index: 10001',
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
        'pointer-events: none',
        'display: none'
      ].join(';');
      const host = modal.querySelector('.vod-modal-content') || modal;
      host.appendChild(el);
      unifiedTooltipEl = el;
      return el;
    };
    const positionUnifiedTooltip = (ev) => {
      if (!unifiedTooltipEl || unifiedTooltipEl.style.display === 'none') return;
      const host = modal.querySelector('.vod-modal-content') || modal;
      const hostRect = host.getBoundingClientRect();
      const padding = 12;
      let x = (ev.clientX - hostRect.left) + padding;
      let y = (ev.clientY - hostRect.top) + padding;
      const rect = unifiedTooltipEl.getBoundingClientRect();
      const maxX = hostRect.width - rect.width - 4;
      const maxY = hostRect.height - rect.height - 4;
      if (x > maxX) x = Math.max(4, maxX);
      if (y > maxY) y = Math.max(4, maxY);
      unifiedTooltipEl.style.left = `${x}px`;
      unifiedTooltipEl.style.top = `${y}px`;
    };
    modalBodyEl3.addEventListener('mouseover', (e) => {
      const target = e.target.closest('.stream-title');
      if (!target) return;
      const isOverflow = (el) => el && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
      if (!isOverflow(target)) return;
      const content = target.getAttribute('data-full') || target.textContent || '';
      if (!content) return;
      const tip = ensureUnifiedTooltip();
      tip.textContent = content;
      tip.style.display = 'block';
      positionUnifiedTooltip(e);
    });
    modalBodyEl3.addEventListener('mousemove', (e) => {
      if (unifiedTooltipEl && unifiedTooltipEl.style.display === 'block') positionUnifiedTooltip(e);
    });
    modalBodyEl3.addEventListener('mouseout', (e) => {
      if (e.target.closest('.stream-title') && !e.relatedTarget?.closest?.('.stream-title')) {
        if (unifiedTooltipEl) unifiedTooltipEl.style.display = 'none';
      }
    });
  }
  loadChannelVods(channelId, modal);
}

function loadChannelVods(channelId, modal) {
  console.log('Loading VODs for channel:', channelId);
  chrome.runtime.sendMessage({ 
    type: 'vods:get', 
    username: channelId, 
    limit: 20 
  }, (response) => {
    console.log('VOD response received:', response);
    const modalBodyEl = modal.querySelector('.vod-modal-body');
    
    if (chrome.runtime.lastError) {
      console.error('Chrome runtime error:', chrome.runtime.lastError);
      while (modalBodyEl.firstChild) {
        modalBodyEl.removeChild(modalBodyEl.firstChild);
      }
      const errorDiv = document.createElement('div');
      errorDiv.className = 'vod-error';
      const errorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      errorSvg.setAttribute('width', '24');
      errorSvg.setAttribute('height', '24');
      errorSvg.setAttribute('viewBox', '0 0 24 24');
      errorSvg.setAttribute('fill', 'none');
      errorSvg.setAttribute('stroke', 'currentColor');
      errorSvg.setAttribute('stroke-width', '2');
      errorSvg.setAttribute('stroke-linecap', 'round');
      errorSvg.setAttribute('stroke-linejoin', 'round');
      const errorCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      errorCircle.setAttribute('cx', '12');
      errorCircle.setAttribute('cy', '12');
      errorCircle.setAttribute('r', '10');
      const errorLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine1.setAttribute('x1', '15');
      errorLine1.setAttribute('y1', '9');
      errorLine1.setAttribute('x2', '9');
      errorLine1.setAttribute('y2', '15');
      const errorLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine2.setAttribute('x1', '9');
      errorLine2.setAttribute('y1', '9');
      errorLine2.setAttribute('x2', '15');
      errorLine2.setAttribute('y2', '15');
      errorSvg.appendChild(errorCircle);
      errorSvg.appendChild(errorLine1);
      errorSvg.appendChild(errorLine2);
      const errorText = document.createElement('div');
      errorText.style.cssText = 'margin-top: 8px;';
      errorText.textContent = chrome.i18n.getMessage('errorLoadingVods', [chrome.runtime.lastError.message]) || ('Error loading VODs: ' + chrome.runtime.lastError.message);
      errorDiv.appendChild(errorSvg);
      errorDiv.appendChild(errorText);
      modalBodyEl.appendChild(errorDiv);
      return;
    }
    if (response?.ok) {
      const items = response.items || response.vods;
      console.log('VODs loaded successfully:', items.length);
      renderVodList(items, modalBodyEl, channelId, response.cursor || null);
    } else {
      console.error('VOD loading failed:', response);
      while (modalBodyEl.firstChild) {
        modalBodyEl.removeChild(modalBodyEl.firstChild);
      }
      const errorDiv2 = document.createElement('div');
      errorDiv2.className = 'vod-error';
      const errorSvg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      errorSvg2.setAttribute('width', '24');
      errorSvg2.setAttribute('height', '24');
      errorSvg2.setAttribute('viewBox', '0 0 24 24');
      errorSvg2.setAttribute('fill', 'none');
      errorSvg2.setAttribute('stroke', 'currentColor');
      errorSvg2.setAttribute('stroke-width', '2');
      errorSvg2.setAttribute('stroke-linecap', 'round');
      errorSvg2.setAttribute('stroke-linejoin', 'round');
      const errorCircle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      errorCircle2.setAttribute('cx', '12');
      errorCircle2.setAttribute('cy', '12');
      errorCircle2.setAttribute('r', '10');
      const errorLine1_2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine1_2.setAttribute('x1', '15');
      errorLine1_2.setAttribute('y1', '9');
      errorLine1_2.setAttribute('x2', '9');
      errorLine1_2.setAttribute('y2', '15');
      const errorLine2_2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine2_2.setAttribute('x1', '9');
      errorLine2_2.setAttribute('y1', '9');
      errorLine2_2.setAttribute('x2', '15');
      errorLine2_2.setAttribute('y2', '15');
      errorSvg2.appendChild(errorCircle2);
      errorSvg2.appendChild(errorLine1_2);
      errorSvg2.appendChild(errorLine2_2);
      const errorText2 = document.createElement('div');
      errorText2.style.cssText = 'margin-top: 8px;';
      errorText2.textContent = chrome.i18n.getMessage('errorLoadingVods', [response?.error || 'Unknown error']) || ('Error loading VODs: ' + (response?.error || 'Unknown error'));
      errorDiv2.appendChild(errorSvg2);
      errorDiv2.appendChild(errorText2);
      modalBodyEl.appendChild(errorDiv2);
    }
  });
}

function renderVodList(vods, container, channelId = null, cursor = null) {
  if (!vods || vods.length === 0) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'vod-error';
    const emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    emptySvg.setAttribute('width', '24');
    emptySvg.setAttribute('height', '24');
    emptySvg.setAttribute('viewBox', '0 0 24 24');
    emptySvg.setAttribute('fill', 'none');
    emptySvg.setAttribute('stroke', 'currentColor');
    emptySvg.setAttribute('stroke-width', '2');
    emptySvg.setAttribute('stroke-linecap', 'round');
    emptySvg.setAttribute('stroke-linejoin', 'round');
    const emptyCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    emptyCircle.setAttribute('cx', '12');
    emptyCircle.setAttribute('cy', '12');
    emptyCircle.setAttribute('r', '10');
    const emptyLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    emptyLine1.setAttribute('x1', '15');
    emptyLine1.setAttribute('y1', '9');
    emptyLine1.setAttribute('x2', '9');
    emptyLine1.setAttribute('y2', '15');
    const emptyLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    emptyLine2.setAttribute('x1', '9');
    emptyLine2.setAttribute('y1', '9');
    emptyLine2.setAttribute('x2', '15');
    emptyLine2.setAttribute('y2', '15');
    emptySvg.appendChild(emptyCircle);
    emptySvg.appendChild(emptyLine1);
    emptySvg.appendChild(emptyLine2);
    const emptyText = document.createElement('div');
    emptyText.style.cssText = 'margin-top: 8px;';
    emptyText.textContent = chrome.i18n.getMessage('noVodsFound') || 'No VODs found';
    emptyDiv.appendChild(emptySvg);
    emptyDiv.appendChild(emptyText);
    container.appendChild(emptyDiv);
    return;
  }

  const vodList = document.createElement('div');
  vodList.className = 'vod-list';
  
  vods.forEach(vod => {
    const vodItem = document.createElement('div');
    vodItem.className = 'vod-item';
    const duration = formatDuration(vod.duration);
    const views = formatViews(vod.view_count);
    const date = formatDate(vod.created_at);
    const isSubOnly = !!(vod && (vod.isSubscriberOnly === true || (typeof vod.viewable === 'string' && vod.viewable.toLowerCase() !== 'public')));
    const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
    
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'vod-thumbnail';
    const imgElement33 = document.createElement('img');
    imgElement33.src = thumbnailUrl;
    imgElement33.alt = vod.title || '';
    thumbnailDiv.appendChild(imgElement33);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'vod-content';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'vod-title';
    titleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'stream-title';
    titleSpan.setAttribute('data-full', vod.title || '');
    titleSpan.style.cssText = 'flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4;min-height: calc(1.4em * 2);';
    titleSpan.textContent = vod.title || '';
    
    titleDiv.appendChild(titleSpan);
    contentDiv.appendChild(titleDiv);
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'vod-meta';
    metaDiv.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    
    if (isSubOnly) {
      const badge = document.createElement('span');
      badge.className = 'vod-badge';
      badge.style.cssText = 'padding:2px 6px;border-radius:6px;background:#ef4444;color:#ffffff;border:1px solid #ef4444;font-size:10px;';
      badge.textContent = chrome.i18n.getMessage('subscriberOnly') || 'Subscriber-only';
      metaDiv.appendChild(badge);
    }
    
    const durationDiv = document.createElement('div');
    durationDiv.className = 'vod-duration';
    durationDiv.textContent = duration;
    metaDiv.appendChild(durationDiv);
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'vod-date';
    dateDiv.textContent = date;
    metaDiv.appendChild(dateDiv);
    
    contentDiv.appendChild(metaDiv);
    
    vodItem.appendChild(thumbnailDiv);
    vodItem.appendChild(contentDiv);
    const imgElement3 = vodItem.querySelector('img');
    imgElement3.addEventListener('error', () => { imgElement3.style.display = 'none'; });
    const thumbEl2 = vodItem.querySelector('.vod-thumbnail');
    let previewEl2 = null;
    const showPreview2 = (e) => {
      if (previewEl2) return;
      previewEl2 = document.createElement('div');
      previewEl2.style.cssText = [
        'position: fixed',
        'z-index: 10001',
        'pointer-events: none',
        'border-radius: 8px',
        'overflow: hidden',
        'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
        'border: none',
        'background: var(--bg-secondary)'
      ].join(';');
      const bigUrl2 = (vod.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360');
      const previewImg2 = document.createElement('img');
      previewImg2.src = bigUrl2;
      previewImg2.style.cssText = 'display:block;width:320px;height:180px;object-fit:cover;';
      previewEl2.appendChild(previewImg2);
      document.body.appendChild(previewEl2);
      positionPreview2(e);
    };
    const positionPreview2 = (e) => {
      if (!previewEl2) return;
      const padding = 12;
      let x = e.clientX + padding;
      let y = e.clientY + padding;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = previewEl2.getBoundingClientRect();
      if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
      if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
      previewEl2.style.left = `${x}px`;
      previewEl2.style.top = `${y}px`;
    };
    const hidePreview2 = () => {
      if (previewEl2) {
        previewEl2.remove();
        previewEl2 = null;
      }
    };
    if (thumbEl2) {
      thumbEl2.addEventListener('mouseover', showPreview2);
      thumbEl2.addEventListener('mousemove', positionPreview2);
      thumbEl2.addEventListener('mouseout', hidePreview2);
    }
    
    vodItem.addEventListener('click', () => {
      chrome.tabs.create({ url: vod.url });
    });
    
    vodList.appendChild(vodItem);
  });
  
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(vodList);
  if (channelId) {
    setupVodInfiniteScroll(container, channelId, cursor);
  }
}

function setupVodInfiniteScroll(container, channelId, cursor) {
  let loadingMore = false;
  let nextCursor = cursor;
  
  const statusEl = document.createElement('div');
  statusEl.className = 'vod-loading';
  statusEl.textContent = 'Loading more...';
  container.appendChild(statusEl);
  const loadMore = () => {
    if (loadingMore || !nextCursor) return;
    loadingMore = true;
    statusEl.textContent = 'Loading more...';
    chrome.runtime.sendMessage({ type: 'vods:get', username: channelId, limit: 20, after: nextCursor }, (response) => {
      loadingMore = false;
      if (chrome.runtime.lastError || !response?.ok) {
        statusEl.remove();
        return;
      }
      const items = response.items || response.vods;
      nextCursor = response.cursor;
      if (!nextCursor) {
        statusEl.remove();
      }
      const list = container.querySelector('.vod-list');
      items.forEach(vod => {
        const node = document.createElement('div');
        node.className = 'vod-item';
        const duration = formatDuration(vod.duration);
        const views = formatViews(vod.view_count);
        const date = formatDate(vod.created_at);
        const isSubOnly = !!(vod && (vod.isSubscriberOnly === true || (typeof vod.viewable === 'string' && vod.viewable.toLowerCase() !== 'public')));
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'vod-thumbnail';
        const img = document.createElement('img');
        img.src = thumbnailUrl;
        img.alt = vod.title || '';
        thumbnailDiv.appendChild(img);
        const contentDiv = document.createElement('div');
        contentDiv.className = 'vod-content';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'vod-title';
        titleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'stream-title';
        titleSpan.setAttribute('data-full', vod.title || '');
        titleSpan.style.cssText = 'flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4;min-height: calc(1.4em * 2);';
        titleSpan.textContent = vod.title || '';
        titleDiv.appendChild(titleSpan);
        contentDiv.appendChild(titleDiv);
        const metaDiv = document.createElement('div');
        metaDiv.className = 'vod-meta';
        metaDiv.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
        if (isSubOnly) {
          const badge = document.createElement('span');
          badge.className = 'vod-badge';
          badge.style.cssText = 'padding:2px 6px;border-radius:6px;background:#ef4444;color:#ffffff;border:1px solid #ef4444;font-size:10px;';
          badge.textContent = chrome.i18n.getMessage('subscriberOnly') || 'Subscriber-only';
          metaDiv.appendChild(badge);
        }
        const durationDiv = document.createElement('div');
        durationDiv.className = 'vod-duration';
        durationDiv.textContent = duration;
        metaDiv.appendChild(durationDiv);
        const dateDiv = document.createElement('div');
        dateDiv.className = 'vod-date';
        dateDiv.textContent = date;
        metaDiv.appendChild(dateDiv);
        contentDiv.appendChild(metaDiv);
        node.appendChild(thumbnailDiv);
        node.appendChild(contentDiv);
        const imgElement3 = node.querySelector('img');
        imgElement3.addEventListener('error', () => { imgElement3.style.display = 'none'; });
        const thumbEl2 = node.querySelector('.vod-thumbnail');
        let previewEl2 = null;
        const showPreview2 = (e) => {
          if (previewEl2) return;
          previewEl2 = document.createElement('div');
          previewEl2.style.cssText = [
            'position: fixed',
            'z-index: 10001',
            'pointer-events: none',
            'border-radius: 8px',
            'overflow: hidden',
            'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
            'border: none',
            'background: var(--bg-secondary)'
          ].join(';');
          const bigUrl2 = (vod.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360');
          const previewImg2 = document.createElement('img');
          previewImg2.src = bigUrl2;
          previewImg2.style.cssText = 'display:block;width:320px;height:180px;object-fit:cover;';
          previewEl2.appendChild(previewImg2);
          document.body.appendChild(previewEl2);
          positionPreview2(e);
        };
        const positionPreview2 = (e) => {
          if (!previewEl2) return;
          const padding = 12;
          let x = e.clientX + padding;
          let y = e.clientY + padding;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const rect = previewEl2.getBoundingClientRect();
          if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
          if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
          previewEl2.style.left = `${x}px`;
          previewEl2.style.top = `${y}px`;
        };
        const hidePreview2 = () => {
          if (previewEl2) {
            previewEl2.remove();
            previewEl2 = null;
          }
        };
        if (thumbEl2) {
          thumbEl2.addEventListener('mouseover', showPreview2);
          thumbEl2.addEventListener('mousemove', positionPreview2);
          thumbEl2.addEventListener('mouseout', hidePreview2);
        }
        node.addEventListener('click', () => {
          chrome.tabs.create({ url: vod.url });
        });
        list.appendChild(node);
      });
    });
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        loadMore();
      }
    });
  });
  observer.observe(statusEl);
}

function loadVods(channelId, modalBodyEl, after = null) {
  chrome.runtime.sendMessage({ type: 'vods:get', username: channelId, limit: 20, after }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Chrome runtime error:', chrome.runtime.lastError);
      return;
    }
    
    if (response?.ok && (response.items || response.vods)) {
      const items = response.items || response.vods;
      console.log('VODs loaded successfully:', items.length);
      renderVodList(items, modalBodyEl, channelId, response.cursor || null);
    } else {
      console.error('VOD loading failed:', response);
      while (modalBodyEl.firstChild) {
        modalBodyEl.removeChild(modalBodyEl.firstChild);
      }
      const errorDiv = document.createElement('div');
      errorDiv.className = 'vod-error';
      const errorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      errorSvg.setAttribute('width', '24');
      errorSvg.setAttribute('height', '24');
      errorSvg.setAttribute('viewBox', '0 0 24 24');
      errorSvg.setAttribute('fill', 'none');
      errorSvg.setAttribute('stroke', 'currentColor');
      errorSvg.setAttribute('stroke-width', '2');
      errorSvg.setAttribute('stroke-linecap', 'round');
      errorSvg.setAttribute('stroke-linejoin', 'round');
      const errorCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      errorCircle.setAttribute('cx', '12');
      errorCircle.setAttribute('cy', '12');
      errorCircle.setAttribute('r', '10');
      const errorLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine1.setAttribute('x1', '15');
      errorLine1.setAttribute('y1', '9');
      errorLine1.setAttribute('x2', '9');
      errorLine1.setAttribute('y2', '15');
      const errorLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine2.setAttribute('x1', '9');
      errorLine2.setAttribute('y1', '9');
      errorLine2.setAttribute('x2', '15');
      errorLine2.setAttribute('y2', '15');
      errorSvg.appendChild(errorCircle);
      errorSvg.appendChild(errorLine1);
      errorSvg.appendChild(errorLine2);
      const errorText = document.createElement('div');
      errorText.style.cssText = 'margin-top: 8px;';
      errorText.textContent = chrome.i18n.getMessage('errorLoadingVods', [chrome.runtime.lastError.message]) || ('Error loading VODs: ' + chrome.runtime.lastError.message);
      errorDiv.appendChild(errorSvg);
      errorDiv.appendChild(errorText);
      modalBodyEl.appendChild(errorDiv);
      return;
    }
    if (response?.ok) {
      const items = response.items || response.vods;
      console.log('VODs loaded successfully:', items.length);
      renderVodList(items, modalBodyEl, channelId, response.cursor || null);
    } else {
      console.error('VOD loading failed:', response);
      while (modalBodyEl.firstChild) {
        modalBodyEl.removeChild(modalBodyEl.firstChild);
      }
      const errorDiv2 = document.createElement('div');
      errorDiv2.className = 'vod-error';
      const errorSvg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      errorSvg2.setAttribute('width', '24');
      errorSvg2.setAttribute('height', '24');
      errorSvg2.setAttribute('viewBox', '0 0 24 24');
      errorSvg2.setAttribute('fill', 'none');
      errorSvg2.setAttribute('stroke', 'currentColor');
      errorSvg2.setAttribute('stroke-width', '2');
      errorSvg2.setAttribute('stroke-linecap', 'round');
      errorSvg2.setAttribute('stroke-linejoin', 'round');
      const errorCircle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      errorCircle2.setAttribute('cx', '12');
      errorCircle2.setAttribute('cy', '12');
      errorCircle2.setAttribute('r', '10');
      const errorLine1_2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine1_2.setAttribute('x1', '15');
      errorLine1_2.setAttribute('y1', '9');
      errorLine1_2.setAttribute('x2', '9');
      errorLine1_2.setAttribute('y2', '15');
      const errorLine2_2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      errorLine2_2.setAttribute('x1', '9');
      errorLine2_2.setAttribute('y1', '9');
      errorLine2_2.setAttribute('x2', '15');
      errorLine2_2.setAttribute('y2', '15');
      errorSvg2.appendChild(errorCircle2);
      errorSvg2.appendChild(errorLine1_2);
      errorSvg2.appendChild(errorLine2_2);
      const errorText2 = document.createElement('div');
      errorText2.style.cssText = 'margin-top: 8px;';
      errorText2.textContent = chrome.i18n.getMessage('errorLoadingVods', [response?.error || 'Unknown error']) || ('Error loading VODs: ' + (response?.error || 'Unknown error'));
      errorDiv2.appendChild(errorSvg2);
      errorDiv2.appendChild(errorText2);
      modalBodyEl.appendChild(errorDiv2);
    }
  });
}

function renderVodList(vods, container, channelId = null, cursor = null) {
  if (!vods || vods.length === 0) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'vod-error';
    const emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    emptySvg.setAttribute('width', '24');
    emptySvg.setAttribute('height', '24');
    emptySvg.setAttribute('viewBox', '0 0 24 24');
    emptySvg.setAttribute('fill', 'none');
    emptySvg.setAttribute('stroke', 'currentColor');
    emptySvg.setAttribute('stroke-width', '2');
    emptySvg.setAttribute('stroke-linecap', 'round');
    emptySvg.setAttribute('stroke-linejoin', 'round');
    const emptyCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    emptyCircle.setAttribute('cx', '12');
    emptyCircle.setAttribute('cy', '12');
    emptyCircle.setAttribute('r', '10');
    const emptyLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    emptyLine1.setAttribute('x1', '15');
    emptyLine1.setAttribute('y1', '9');
    emptyLine1.setAttribute('x2', '9');
    emptyLine1.setAttribute('y2', '15');
    const emptyLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    emptyLine2.setAttribute('x1', '9');
    emptyLine2.setAttribute('y1', '9');
    emptyLine2.setAttribute('x2', '15');
    emptyLine2.setAttribute('y2', '15');
    emptySvg.appendChild(emptyCircle);
    emptySvg.appendChild(emptyLine1);
    emptySvg.appendChild(emptyLine2);
    const emptyText = document.createElement('div');
    emptyText.style.cssText = 'margin-top: 8px;';
    emptyText.textContent = chrome.i18n.getMessage('noVodsFound') || 'No VODs found';
    emptyDiv.appendChild(emptySvg);
    emptyDiv.appendChild(emptyText);
    container.appendChild(emptyDiv);
    return;
  }
  
  const vodList = document.createElement('div');
  vodList.className = 'vod-list';
  
  vods.forEach(vod => {
    const vodItem = document.createElement('div');
    vodItem.className = 'vod-item';
    const duration = formatDuration(vod.duration);
    const views = formatViews(vod.view_count);
    const date = formatDate(vod.created_at);
    const isSubOnly = !!(vod && (vod.isSubscriberOnly === true || (typeof vod.viewable === 'string' && vod.viewable.toLowerCase() !== 'public')));
    const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
    
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'vod-thumbnail';
    const imgElement33 = document.createElement('img');
    imgElement33.src = thumbnailUrl;
    imgElement33.alt = vod.title || '';
    thumbnailDiv.appendChild(imgElement33);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'vod-content';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'vod-title';
    titleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'stream-title';
    titleSpan.setAttribute('data-full', vod.title || '');
    titleSpan.style.cssText = 'flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4;min-height: calc(1.4em * 2);';
    titleSpan.textContent = vod.title || '';
    
    titleDiv.appendChild(titleSpan);
    contentDiv.appendChild(titleDiv);
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'vod-meta';
    metaDiv.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    
    if (isSubOnly) {
      const badge = document.createElement('span');
      badge.className = 'vod-badge';
      badge.style.cssText = 'padding:2px 6px;border-radius:6px;background:#ef4444;color:#ffffff;border:1px solid #ef4444;font-size:10px;';
      badge.textContent = chrome.i18n.getMessage('subscriberOnly') || 'Subscriber-only';
      metaDiv.appendChild(badge);
    }
    
    const durationDiv = document.createElement('div');
    durationDiv.className = 'vod-duration';
    durationDiv.textContent = duration;
    metaDiv.appendChild(durationDiv);
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'vod-date';
    dateDiv.textContent = date;
    metaDiv.appendChild(dateDiv);
    
    contentDiv.appendChild(metaDiv);
    
    vodItem.appendChild(thumbnailDiv);
    vodItem.appendChild(contentDiv);
    const imgElement3 = vodItem.querySelector('img');
    imgElement3.addEventListener('error', () => { imgElement3.style.display = 'none'; });
    const thumbEl2 = vodItem.querySelector('.vod-thumbnail');
    let previewEl2 = null;
    const showPreview2 = (e) => {
      if (previewEl2) return;
      previewEl2 = document.createElement('div');
      previewEl2.style.cssText = [
        'position: fixed',
        'z-index: 10001',
        'pointer-events: none',
        'border-radius: 8px',
        'overflow: hidden',
        'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
        'border: none',
        'background: var(--bg-secondary)'
      ].join(';');
      const bigUrl2 = (vod.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360');
      const previewImg2 = document.createElement('img');
      previewImg2.src = bigUrl2;
      previewImg2.style.cssText = 'display:block;width:320px;height:180px;object-fit:cover;';
      previewEl2.appendChild(previewImg2);
      document.body.appendChild(previewEl2);
      positionPreview2(e);
    };
    const positionPreview2 = (e) => {
      if (!previewEl2) return;
      const padding = 12;
      let x = e.clientX + padding;
      let y = e.clientY + padding;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = previewEl2.getBoundingClientRect();
      if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
      if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
      previewEl2.style.left = `${x}px`;
      previewEl2.style.top = `${y}px`;
    };
    const hidePreview2 = () => {
      if (previewEl2) {
        previewEl2.remove();
        previewEl2 = null;
      }
    };
    if (thumbEl2) {
      thumbEl2.addEventListener('mouseover', showPreview2);
      thumbEl2.addEventListener('mousemove', positionPreview2);
      thumbEl2.addEventListener('mouseout', hidePreview2);
    }
    
    vodItem.addEventListener('click', () => {
      chrome.tabs.create({ url: vod.url });
    });
    
    vodList.appendChild(vodItem);
  });
  
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(vodList);
  if (channelId) {
    setupVodInfiniteScroll(container, channelId, cursor);
  }
}

function setupVodInfiniteScroll(container, channelId, cursor) {
  let loadingMore = false;
  let nextCursor = cursor;
  
  const statusEl = document.createElement('div');
  statusEl.className = 'vod-loading';
  statusEl.textContent = 'Loading more...';
  container.appendChild(statusEl);
  const loadMore = () => {
    if (loadingMore || !nextCursor) return;
    loadingMore = true;
    statusEl.textContent = 'Loading more...';
    chrome.runtime.sendMessage({ type: 'vods:get', username: channelId, limit: 20, after: nextCursor }, (response) => {
      loadingMore = false;
      if (chrome.runtime.lastError || !response?.ok) {
        statusEl.remove();
        return;
      }
      const items = response.items || response.vods;
      nextCursor = response.cursor;
      if (!nextCursor) {
        statusEl.remove();
      }
      const list = container.querySelector('.vod-list');
      items.forEach(vod => {
        const node = document.createElement('div');
        node.className = 'vod-item';
        const duration = formatDuration(vod.duration);
        const views = formatViews(vod.view_count);
        const date = formatDate(vod.created_at);
        const isSubOnly = !!(vod && (vod.isSubscriberOnly === true || (typeof vod.viewable === 'string' && vod.viewable.toLowerCase() !== 'public')));
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'vod-thumbnail';
        const img = document.createElement('img');
        img.src = thumbnailUrl;
        img.alt = vod.title || '';
        thumbnailDiv.appendChild(img);
        const contentDiv = document.createElement('div');
        contentDiv.className = 'vod-content';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'vod-title';
        titleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'stream-title';
        titleSpan.setAttribute('data-full', vod.title || '');
        titleSpan.style.cssText = 'flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4;min-height: calc(1.4em * 2);';
        titleSpan.textContent = vod.title || '';
        titleDiv.appendChild(titleSpan);
        contentDiv.appendChild(titleDiv);
        const metaDiv = document.createElement('div');
        metaDiv.className = 'vod-meta';
        metaDiv.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
        if (isSubOnly) {
          const badge = document.createElement('span');
          badge.className = 'vod-badge';
          badge.style.cssText = 'padding:2px 6px;border-radius:6px;background:#ef4444;color:#ffffff;border:1px solid #ef4444;font-size:10px;';
          badge.textContent = chrome.i18n.getMessage('subscriberOnly') || 'Subscriber-only';
          metaDiv.appendChild(badge);
        }
        const durationDiv = document.createElement('div');
        durationDiv.className = 'vod-duration';
        durationDiv.textContent = duration;
        metaDiv.appendChild(durationDiv);
        const dateDiv = document.createElement('div');
        dateDiv.className = 'vod-date';
        dateDiv.textContent = date;
        metaDiv.appendChild(dateDiv);
        contentDiv.appendChild(metaDiv);
        node.appendChild(thumbnailDiv);
        node.appendChild(contentDiv);
        const imgElement3 = node.querySelector('img');
        imgElement3.addEventListener('error', () => { imgElement3.style.display = 'none'; });
        const thumbEl2 = node.querySelector('.vod-thumbnail');
        let previewEl2 = null;
        const showPreview2 = (e) => {
          if (previewEl2) return;
          previewEl2 = document.createElement('div');
          previewEl2.style.cssText = [
            'position: fixed',
            'z-index: 10001',
            'pointer-events: none',
            'border-radius: 8px',
            'overflow: hidden',
            'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
            'border: none',
            'background: var(--bg-secondary)'
          ].join(';');
          const bigUrl2 = (vod.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360');
          const previewImg2 = document.createElement('img');
          previewImg2.src = bigUrl2;
          previewImg2.style.cssText = 'display:block;width:320px;height:180px;object-fit:cover;';
          previewEl2.appendChild(previewImg2);
          document.body.appendChild(previewEl2);
          positionPreview2(e);
        };
        const positionPreview2 = (e) => {
          if (!previewEl2) return;
          const padding = 12;
          let x = e.clientX + padding;
          let y = e.clientY + padding;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const rect = previewEl2.getBoundingClientRect();
          if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
          if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
          previewEl2.style.left = `${x}px`;
          previewEl2.style.top = `${y}px`;
        };
        const hidePreview2 = () => {
          if (previewEl2) {
            previewEl2.remove();
            previewEl2 = null;
          }
        };
        if (thumbEl2) {
          thumbEl2.addEventListener('mouseover', showPreview2);
          thumbEl2.addEventListener('mousemove', positionPreview2);
          thumbEl2.addEventListener('mouseout', hidePreview2);
        }
        node.addEventListener('click', () => {
          chrome.tabs.create({ url: vod.url });
        });
        list.appendChild(node);
      });
    });
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        loadMore();
      }
    });
  });
  observer.observe(statusEl);
}

function renderVodList(vods, container, channelId = null, cursor = null) {
  if (!vods || vods.length === 0) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'vod-error';
    
    const emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    emptySvg.setAttribute('width', '24');
    emptySvg.setAttribute('height', '24');
    emptySvg.setAttribute('viewBox', '0 0 24 24');
    emptySvg.setAttribute('fill', 'none');
    emptySvg.setAttribute('stroke', 'currentColor');
    emptySvg.setAttribute('stroke-width', '2');
    emptySvg.setAttribute('stroke-linecap', 'round');
    emptySvg.setAttribute('stroke-linejoin', 'round');
    
    const emptyRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    emptyRect.setAttribute('x', '2');
    emptyRect.setAttribute('y', '7');
    emptyRect.setAttribute('width', '20');
    emptyRect.setAttribute('height', '15');
    emptyRect.setAttribute('rx', '2');
    emptyRect.setAttribute('ry', '2');
    const emptyPolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    emptyPolyline.setAttribute('points', '17 2 12 7 7 2');
    
    emptySvg.appendChild(emptyRect);
    emptySvg.appendChild(emptyPolyline);
    
    const emptyText = document.createElement('div');
    emptyText.style.cssText = 'margin-top: 8px;';
    emptyText.textContent = chrome.i18n.getMessage('noVodsFoundForChannel') || 'No VODs found for this channel';
    
    emptyDiv.appendChild(emptySvg);
    emptyDiv.appendChild(emptyText);
    container.appendChild(emptyDiv);
    return;
  }
  
  const vodList = document.createElement('div');
  vodList.className = 'vod-list';
  
  vods.forEach(vod => {
    const vodItem = document.createElement('div');
    vodItem.className = 'vod-item';
    
    const duration = formatDuration(vod.duration);
    const views = formatViews(vod.view_count);
    const date = formatDate(vod.created_at);
    const isSubOnly = !!(vod && (vod.isSubscriberOnly === true || (typeof vod.viewable === 'string' && vod.viewable.toLowerCase() !== 'public')));
    
    const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
    
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'vod-thumbnail';
    const imgElement33 = document.createElement('img');
    imgElement33.src = thumbnailUrl;
    imgElement33.alt = vod.title || '';
    thumbnailDiv.appendChild(imgElement33);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'vod-content';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'vod-title';
    titleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'stream-title';
    titleSpan.setAttribute('data-full', (vod.title || '').replace(/\\/g, "\\").replace(/\n/g, ' ').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    titleSpan.style.cssText = 'flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4;min-height: calc(1.4em * 2);';
    titleSpan.textContent = vod.title || '';
    titleDiv.appendChild(titleSpan);
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'vod-meta';
    metaDiv.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    
    if (isSubOnly) {
      const badge = document.createElement('span');
      badge.className = 'vod-badge';
      badge.style.cssText = 'padding:2px 6px;border-radius:6px;background:#ef4444;color:#ffffff;border:1px solid #ef4444;font-size:10px;';
      badge.textContent = chrome.i18n.getMessage('subscriberOnly') || 'Subscriber-only';
      metaDiv.appendChild(badge);
    }
    
    const durationDiv = document.createElement('div');
    durationDiv.className = 'vod-duration';
    durationDiv.textContent = duration;
    metaDiv.appendChild(durationDiv);
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'vod-date';
    dateDiv.textContent = date;
    metaDiv.appendChild(dateDiv);
    
    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(metaDiv);
    
    vodItem.appendChild(thumbnailDiv);
    vodItem.appendChild(contentDiv);
    
    const imgElement32 = vodItem.querySelector('img');
    imgElement32.addEventListener('error', () => {
      imgElement32.style.display = 'none';
    });
    
    const thumbEl = vodItem.querySelector('.vod-thumbnail');
    let previewEl = null;
    const showPreview = (e) => {
      if (previewEl) return;
      previewEl = document.createElement('div');
      previewEl.style.cssText = [
        'position: fixed',
        'z-index: 10001',
        'pointer-events: none',
        'border-radius: 8px',
        'overflow: hidden',
        'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
        'border: none',
        'background: var(--bg-secondary)'
      ].join(';');
      const bigUrl = (vod.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360');
      const previewImg = document.createElement('img');
      previewImg.src = bigUrl;
      previewImg.style.cssText = 'display:block;width:320px;height:180px;object-fit:cover;';
      previewEl.appendChild(previewImg);
      document.body.appendChild(previewEl);
      positionPreview(e);
    };
    const positionPreview = (e) => {
      if (!previewEl) return;
      const padding = 12;
      let x = e.clientX + padding;
      let y = e.clientY + padding;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = previewEl.getBoundingClientRect();
      if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
      if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
      previewEl.style.left = `${x}px`;
      previewEl.style.top = `${y}px`;
    };
    const hidePreview = () => {
      if (previewEl) {
        previewEl.remove();
        previewEl = null;
      }
    };
    if (thumbEl) {
      thumbEl.addEventListener('mouseover', showPreview);
      thumbEl.addEventListener('mousemove', positionPreview);
      thumbEl.addEventListener('mouseout', hidePreview);
    }
    
    vodItem.addEventListener('click', () => {
      chrome.tabs.create({ url: vod.url });
    });
    
    vodList.appendChild(vodItem);
  });
  
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(vodList);
  if (channelId) {
    setupVodInfiniteScroll(container, channelId, cursor);
  }
}

function setupVodInfiniteScroll(container, channelId, cursor) {
  let loadingMore = false;
  let nextCursor = cursor;
  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  sentinel.style.width = '100%';
  container.appendChild(sentinel);
  const statusEl = document.createElement('div');
  statusEl.className = 'vod-load-status';
  statusEl.style.cssText = 'padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px;';
  container.appendChild(statusEl);
  const loadMore = () => {
    if (loadingMore || !nextCursor) return;
    loadingMore = true;
    statusEl.textContent = chrome.i18n.getMessage('loadingMoreVods') || 'Loading more...';
    chrome.runtime.sendMessage({ type: 'vods:get', username: channelId, limit: 20, after: nextCursor }, (response) => {
      loadingMore = false;
      if (chrome.runtime.lastError || !response?.ok) return;
      const items = response.items || response.vods || [];
      nextCursor = response.cursor || null;
      const list = container.querySelector('.vod-list');
      items.forEach(vod => {
        const node = document.createElement('div');
        node.className = 'vod-item';
        const duration = formatDuration(vod.duration);
        const views = formatViews(vod.view_count);
        const date = formatDate(vod.created_at);
        const isSubOnly = !!(vod && (vod.isSubscriberOnly === true || (typeof vod.viewable === 'string' && vod.viewable.toLowerCase() !== 'public')));
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'vod-thumbnail';
        const img = document.createElement('img');
        img.src = thumbnailUrl;
        img.alt = vod.title || '';
        thumbnailDiv.appendChild(img);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'vod-content';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'vod-title';
        titleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'stream-title';
        titleSpan.setAttribute('data-full', vod.title || '');
        titleSpan.style.cssText = 'flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4;min-height: calc(1.4em * 2);';
        titleSpan.textContent = vod.title || '';
        
        titleDiv.appendChild(titleSpan);
        contentDiv.appendChild(titleDiv);
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'vod-meta';
        metaDiv.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
        
        if (isSubOnly) {
          const badge = document.createElement('span');
          badge.className = 'vod-badge';
          badge.style.cssText = 'padding:2px 6px;border-radius:6px;background:#ef4444;color:#ffffff;border:1px solid #ef4444;font-size:10px;';
          badge.textContent = chrome.i18n.getMessage('subscriberOnly') || 'Subscriber-only';
          metaDiv.appendChild(badge);
        }
        
        const durationDiv = document.createElement('div');
        durationDiv.className = 'vod-duration';
        durationDiv.textContent = duration;
        metaDiv.appendChild(durationDiv);
        
        const dateDiv = document.createElement('div');
        dateDiv.className = 'vod-date';
        dateDiv.textContent = date;
        metaDiv.appendChild(dateDiv);
        
        contentDiv.appendChild(metaDiv);
        
        node.appendChild(thumbnailDiv);
        node.appendChild(contentDiv);
        const imgElement3 = node.querySelector('img');
        imgElement3.addEventListener('error', () => { imgElement3.style.display = 'none'; });
        const thumbEl2 = node.querySelector('.vod-thumbnail');
        let previewEl2 = null;
        const showPreview2 = (e) => {
          if (previewEl2) return;
          previewEl2 = document.createElement('div');
          previewEl2.style.cssText = [
            'position: fixed',
            'z-index: 10001',
            'pointer-events: none',
            'border-radius: 8px',
            'overflow: hidden',
            'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
            'border: none',
            'background: var(--bg-secondary)'
          ].join(';');
          const bigUrl2 = (vod.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360');
          const previewImg2 = document.createElement('img');
          previewImg2.src = bigUrl2;
          previewImg2.style.cssText = 'display:block;width:320px;height:180px;object-fit:cover;';
          previewEl2.appendChild(previewImg2);
          document.body.appendChild(previewEl2);
          positionPreview2(e);
        };
        const positionPreview2 = (e) => {
          if (!previewEl2) return;
          const padding = 12;
          let x = e.clientX + padding;
          let y = e.clientY + padding;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const rect = previewEl2.getBoundingClientRect();
          if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
          if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
          previewEl2.style.left = `${x}px`;
          previewEl2.style.top = `${y}px`;
        };
        const hidePreview2 = () => {
          if (previewEl2) { previewEl2.remove(); previewEl2 = null; }
        };
        if (thumbEl2) {
          thumbEl2.addEventListener('mouseover', showPreview2);
          thumbEl2.addEventListener('mousemove', positionPreview2);
          thumbEl2.addEventListener('mouseout', hidePreview2);
        }
        node.addEventListener('click', () => { chrome.tabs.create({ url: vod.url }); });
        list.appendChild(node);
      });
      if (!nextCursor) {
        statusEl.textContent = chrome.i18n.getMessage('noMoreVods') || 'No more VODs';
        observer.disconnect();
      } else {
        statusEl.textContent = '';
      }
    });
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) loadMore();
    });
  }, { root: container, rootMargin: '200px' });
  observer.observe(sentinel);
}

function formatDuration(duration) {
  if (typeof duration === 'string') {
    const match = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (match) {
      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2] || '0');
      const seconds = parseInt(match[3] || '0');
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
    return duration;
  } else {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const secs = duration % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }
}

function formatViews(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return chrome.i18n.getMessage('todayLabel') || 'Today';
  } else if (diffDays === 1) {
    return chrome.i18n.getMessage('yesterdayLabel') || 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
}
