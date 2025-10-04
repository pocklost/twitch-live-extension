const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const TWITCH_OAUTH_BASE = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_BASE = 'https://id.twitch.tv/oauth2/token';

const TWITCH_CLIENT_ID = 'pujtelt7e3go829amtruwhoeido1rx';
const REDIRECT_URI = chrome.identity ? chrome.identity.getRedirectURL() : 'http://localhost';

const STORAGE = {
  channels: 'tsn_channels',
  onlineIndex: 'tsn_online_index',
  lastNotifiedAt: 'tsn_last_notified_at',
  settings: 'tsn_settings',
  accessToken: 'tsn_access_token',
  tokenExpiry: 'tsn_token_expiry',
  notificationSettings: 'tsn_notification_settings',
  followDates: 'tsn_follow_dates',
  lastStreamTimes: 'tsn_last_stream_times',
  cachedStreams: 'tsn_cached_streams',
  cachedAt: 'tsn_cached_at',
  countdownStartTime: 'tsn_countdown_start_time',
  pollInterval: 'tsn_poll_interval'
};

class StreamStateManager {
  async read(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  async write(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  async getChannels() {
    const data = await this.read([STORAGE.channels]);
    return Array.isArray(data[STORAGE.channels]) ? data[STORAGE.channels] : [];
  }

  async setChannels(channels) {
    const list = Array.from(new Set((channels || []).map((c) => String(c).toLowerCase())));
    await this.write({ [STORAGE.channels]: list });
    return list;
  }

  async setChannelsWithData(channelsData) {
    await this.write({ [STORAGE.channels]: channelsData });
    return channelsData;
  }

  async getChannelsWithData() {
    const data = await this.read([STORAGE.channels]);
    return Array.isArray(data[STORAGE.channels]) ? data[STORAGE.channels] : [];
  }

  async getFollowDates() {
    const data = await this.read([STORAGE.followDates]);
    return data[STORAGE.followDates] || {};
  }

  async setFollowDates(followDates) {
    await this.write({ [STORAGE.followDates]: followDates });
  }

  async updateFollowDate(username, date) {
    const followDates = await this.getFollowDates();
    if (!followDates[username]) {
      followDates[username] = date;
      await this.setFollowDates(followDates);
    }
    if (msg?.action === 'closeCurrentTab') {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const current = tabs && tabs[0];
          if (current && current.id) {
            chrome.tabs.remove(current.id, () => {
              sendResponse({ success: true });
            });
          } else {
            sendResponse({ success: false, error: 'No active tab' });
          }
        });
      } catch (e) {
        console.error('Error closing current tab:', e);
        sendResponse({ success: false, error: String(e?.message || e) });
      }
      return;
    }
  }

  async getLastStreamTimes() {
    const data = await this.read([STORAGE.lastStreamTimes]);
    return data[STORAGE.lastStreamTimes] || {};
  }

  async setLastStreamTimes(lastStreamTimes) {
    await this.write({ [STORAGE.lastStreamTimes]: lastStreamTimes });
  }

  async updateLastStreamTime(username, streamTime) {
    const lastStreamTimes = await this.getLastStreamTimes();
    lastStreamTimes[username] = streamTime;
    await this.setLastStreamTimes(lastStreamTimes);
  }

  async getAccessToken() {
    const data = await this.read([STORAGE.accessToken, STORAGE.tokenExpiry]);
    const token = data[STORAGE.accessToken];
    const expiry = data[STORAGE.tokenExpiry];
    
    if (token && expiry && Date.now() < expiry) {
      return token;
    }
    return null;
  }

  async authorizeUser() {
    console.log('Starting OAuth authorization...');
    
    if (TWITCH_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
      throw new Error('Please configure your Twitch Client ID in background.js');
    }
    
    const authUrl = `${TWITCH_OAUTH_BASE}?` + new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      redirect_uri: 'https://twitch.tv',
      response_type: 'token',
      scope: 'user:read:email user:read:follows',
      state: 'twitch_live_notifier'
    });
    
    try {
      const tab = await chrome.tabs.create({ url: authUrl });
      
      return new Promise((resolve, reject) => {
        const checkTab = () => {
          chrome.tabs.get(tab.id, (currentTab) => {
            if (chrome.runtime.lastError) {
              console.log('Tab check error:', chrome.runtime.lastError.message);
              reject(new Error('Authorization tab was closed or not accessible'));
              return;
            }
            
            if (!currentTab || !currentTab.url) {
              console.log('Tab or URL not available, continuing to check...');
              setTimeout(checkTab, 1000);
              return;
            }
            
            if (currentTab.url.includes('access_token=')) {
              const url = new URL(currentTab.url);
              const fragment = url.hash.substring(1);
              const params = new URLSearchParams(fragment);
              const accessToken = params.get('access_token');
              
              if (accessToken) {
                this.write({
                  [STORAGE.accessToken]: accessToken,
                  [STORAGE.tokenExpiry]: Date.now() + (365 * 24 * 60 * 60 * 1000)
                }).then(() => {
                  chrome.tabs.update(tab.id, {
                    url: chrome.runtime.getURL('authorization-success.html')
                  });
                  console.log('User authorized successfully');
                  resolve(accessToken);
                });
              } else {
                chrome.tabs.remove(tab.id);
                reject(new Error('No access token received'));
              }
            } else if (currentTab.url.includes('error=')) {
              chrome.tabs.remove(tab.id);
              reject(new Error('Authorization was denied or failed'));
            } else {
              setTimeout(checkTab, 1000);
            }
          });
        };
        
        setTimeout(checkTab, 2000);
      });
      
    } catch (error) {
      console.error('Authorization failed:', error);
      throw error;
    }
  }

  async fetchStatuses(usernames) {
    if (!usernames || usernames.length === 0) return {};
    
    if (TWITCH_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
      console.error('Twitch Client ID not configured! Please set your Client ID in background.js');
      throw new Error('Twitch Client ID not configured');
    }
    
    try {
      const accessToken = await this.getAccessToken();
      const lower = Array.from(new Set(usernames.map((u) => u.toLowerCase())));
      
      const userIds = await this.getUserIds(lower, accessToken);
      if (Object.keys(userIds).length === 0) {
        console.warn('No valid user IDs found for the requested usernames');
        const result = {};
        for (const login of lower) {
          result[login] = undefined;
        }
        return result;
      }
      
      const userIdArray = Object.values(userIds);
      const batchSize = 100;
      const result = {};
      
      for (const login of lower) {
        result[login] = undefined;
      }
      
      for (let i = 0; i < userIdArray.length; i += batchSize) {
        const batch = userIdArray.slice(i, i + batchSize);
        console.log(`Fetching streams for batch ${Math.floor(i / batchSize) + 1}, user IDs: ${batch.join(', ')}`);
        
        const url = new URL(`${TWITCH_API_BASE}/streams`);
        batch.forEach(userId => {
          url.searchParams.append('user_id', userId);
        });
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Twitch API failed for batch ${Math.floor(i / batchSize) + 1}: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Twitch API failed for batch ${Math.floor(i / batchSize) + 1}: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        const streams = data.data || [];
        
        for (const stream of streams) {
          const login = stream.user_login.toLowerCase();
          if (lower.includes(login)) {
            result[login] = {
              username: login,
              channel: {
                display_name: stream.user_name,
                status: stream.title
              },
              game: stream.game_name,
              viewers: stream.viewer_count,
              created_at: stream.started_at
            };
            
            await this.updateLastStreamTime(login, stream.started_at);
          }
        }
        
        if (i + batchSize < userIdArray.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log('Twitch API success:', result);
      return result;
      
    } catch (error) {
      console.error('Twitch API error:', error);
      throw error;
    }
  }

  async getUserIds(usernames, accessToken) {
    const batchSize = 100;
    const result = {};
    
    for (let i = 0; i < usernames.length; i += batchSize) {
      const batch = usernames.slice(i, i + batchSize);
      const url = new URL(`${TWITCH_API_BASE}/users`);
      
      batch.forEach(login => {
        url.searchParams.append('login', login);
      });
      
      console.log(`Fetching user IDs for batch: ${batch.join(', ')}`);
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      });
      
      if (!response.ok) {
        console.error(`User lookup failed for batch: ${response.status} ${response.statusText}`);
        throw new Error(`User lookup failed: ${response.status}`);
      }
      
      const data = await response.json();
      const users = data.data || [];
      
      for (const user of users) {
        result[user.login.toLowerCase()] = user.id;
      }
    }
    
    console.log(`Found user IDs for: ${Object.keys(result).join(', ')}`);
    return result;
  }

  async getFollowedChannels(accessToken) {
    try {
      console.log('Getting followed channels with token:', accessToken ? 'present' : 'missing');
      
      const userResponse = await fetch(`${TWITCH_API_BASE}/users`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      });
      
      console.log('User info response status:', userResponse.status);
      
      if (!userResponse.ok) {
        const errorText = await userResponse.text();
        console.error('User info error:', errorText);
        throw new Error(`Failed to get user info: ${userResponse.status} - ${errorText}`);
      }
      
      const userData = await userResponse.json();
      console.log('User data response:', userData);
      
      if (!userData.data || userData.data.length === 0) {
        throw new Error('No user data found in response');
      }
      
      const userId = userData.data[0].id;
      console.log('Current user ID:', userId);
      
      let allFollowedChannels = [];
      let cursor = null;
      let page = 1;
      const maxPages = 20;
      
      do {
        const followUrl = `${TWITCH_API_BASE}/channels/followed?user_id=${userId}&first=100${cursor ? `&after=${cursor}` : ''}`;
        console.log(`Fetching followed channels page ${page} from:`, followUrl);
        
        const followResponse = await fetch(followUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID
          }
        });
        
        console.log(`Followed channels page ${page} response status:`, followResponse.status);
        
        if (!followResponse.ok) {
          const errorText = await followResponse.text();
          console.error(`Failed to get followed channels page ${page}: ${followResponse.status} ${followResponse.statusText}`, errorText);
          throw new Error(`Failed to get followed channels page ${page}: ${followResponse.status} - ${errorText}`);
        }
        
        const followData = await followResponse.json();
        console.log(`Follow data page ${page} response:`, followData);
        
        const pageChannels = followData.data || [];
        allFollowedChannels = allFollowedChannels.concat(pageChannels);
        
        console.log(`Page ${page}: Found ${pageChannels.length} channels, total so far: ${allFollowedChannels.length}`);
        
        cursor = followData.pagination?.cursor;
        page++;
        
        if (cursor && page <= maxPages) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } while (cursor && page <= maxPages);
      
      console.log(`Found total ${allFollowedChannels.length} followed channels across ${page - 1} pages`);
      console.log('All followed channels data:', allFollowedChannels);
      
      const result = allFollowedChannels.map(channel => {
        const login = channel.broadcaster_login || channel.login;
        const followedAt = channel.followed_at;
        const displayName = channel.broadcaster_name || channel.display_name || login;
        
        console.log('Processing channel:', {
          login: login,
          followedAt: followedAt,
          displayName: displayName,
          fullChannel: channel
        });
        
        if (!login) {
          console.warn('Channel missing login:', channel);
        }
        return login ? {
          username: login.toLowerCase(),
          followedAt: followedAt,
          displayName: displayName
        } : null;
      }).filter(Boolean);
      
      console.log('Processed followed channels with dates:', result);
      return result;
      
    } catch (error) {
      console.error('Error getting followed channels:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }


  async updateBadge(onlineCount) {
    try {
      console.log('Updating badge with count:', onlineCount);
      chrome.action.setBadgeText({ text: onlineCount > 0 ? String(onlineCount) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#5cb85c' });
      console.log('Badge updated successfully');
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }

  async startCountdown(pollIntervalMinutes) {
    const pollIntervalSeconds = pollIntervalMinutes * 60;
    const startTime = Date.now();
    
    await this.write({
      [STORAGE.countdownStartTime]: startTime,
      [STORAGE.pollInterval]: pollIntervalSeconds
    });
    
    console.log(`Countdown started: ${pollIntervalSeconds} seconds from now`);
  }

  async getCountdownRemaining() {
    const data = await this.read([STORAGE.countdownStartTime, STORAGE.pollInterval]);
    const startTime = data[STORAGE.countdownStartTime];
    const pollInterval = data[STORAGE.pollInterval];
    
    if (!startTime || !pollInterval) {
      return 0;
    }
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, pollInterval - elapsed);
    
    return remaining;
  }

  async notifyNewLives(liveMap) {
    const settingsObj = await this.read([STORAGE.settings, STORAGE.notificationSettings, STORAGE.channels]);
    const settings = settingsObj[STORAGE.settings] || {};
    const notificationSettings = settingsObj[STORAGE.notificationSettings] || {};
    const channels = settingsObj[STORAGE.channels] || [];
    
    if (settings.muteNotifications) {
      console.log('Notifications are muted');
      return;
    }
    
    const { [STORAGE.onlineIndex]: prevIndex, [STORAGE.lastNotifiedAt]: lastNotifiedAt } = await this.read([
      STORAGE.onlineIndex,
      STORAGE.lastNotifiedAt
    ]);
    const previous = prevIndex || {};
    const lastTimes = lastNotifiedAt || {};
    
    const currentlyLive = Object.keys(liveMap).filter(login => liveMap[login] && liveMap[login].channel);
    console.log('Currently live users:', currentlyLive);
    console.log('Previous live users:', Object.keys(previous));
    console.log('Auto-follow enabled:', settings.autoFollow);
    console.log('Notification settings:', notificationSettings);
    
    const trackedChannels = new Set([
      ...(channels || []),
      ...Object.keys(notificationSettings)
    ]);
    console.log('Tracked channels:', Array.from(trackedChannels));
    
    for (const login of currentlyLive) {
      if (!trackedChannels.has(login)) {
        console.log(`Skipping ${login} - not in tracked channels`);
        continue;
      }
      if (!previous[login]) {
        const s = liveMap[login];
        const last = lastTimes[login] || 0;
        
        let shouldNotify = false;
        
        console.log(`Checking notification for ${login}:`, {
          notificationSettings: notificationSettings[login],
          allNotificationSettings: notificationSettings
        });
        
        if (notificationSettings[login] === true) {
          shouldNotify = true;
          console.log(`Notification enabled for ${login} (explicitly enabled)`);
        } else if (notificationSettings[login] === false) {
          shouldNotify = false;
          console.log(`Notification disabled for ${login} (explicitly disabled)`);
        } else {
          shouldNotify = false;
          console.log(`Notification disabled for ${login} (default - no setting)`);
        }
        
        if (Date.now() - last > 15 * 60 * 1000) {
          if (shouldNotify) {
            console.log(`Sending notification for ${login}: ${s.channel.display_name}`);
            chrome.notifications.create(`live_${login}_${Date.now()}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: chrome.i18n.getMessage('streamStartedNotification', [s.channel.display_name]),
              message: `${s.channel.status} — ${s.game}`
            });
            lastTimes[login] = Date.now();
          } else {
            console.log(`Skipping notification for ${login} (notification disabled)`);
          }
        } else {
          console.log(`Rate limited for ${login}, last notification: ${new Date(last).toLocaleString()}`);
        }
      }
    }

    const newIndex = {};
    currentlyLive.forEach((l) => (newIndex[l] = true));
    await this.write({ [STORAGE.onlineIndex]: newIndex, [STORAGE.lastNotifiedAt]: lastTimes });
  }
}

const tracker = new StreamStateManager();

async function performPollAndBroadcast() {
  const settingsObj = await tracker.read([STORAGE.settings]);
  const settings = settingsObj[STORAGE.settings] || {};
  
  const pollInterval = Math.max(1, Number(settings.pollMinutes || 1));
  await tracker.startCountdown(pollInterval);
  
  let channelsData = await tracker.getChannelsWithData();
  let channels = channelsData.map(c => typeof c === 'string' ? c : c.username);
  console.log('Background poll: checking channels:', channels);
  
  if (settings.autoFollow) {
    try {
      console.log('Starting auto-follow process...');
      console.log('Current settings:', settings);
      
      const accessToken = await tracker.getAccessToken();
      if (!accessToken) {
        console.log('No access token available, skipping auto-follow. User needs to authorize manually.');
      } else {
        console.log('Access token obtained, fetching followed channels...');
        
        const followedChannels = await tracker.getFollowedChannels(accessToken);
        console.log('Followed channels:', followedChannels);
        
        const followedUsernames = followedChannels.map(channel => channel.username);
        
        const allChannels = [...new Set([...channels, ...followedUsernames])];
        console.log(`Auto-follow: Found ${followedChannels.length} followed channels, total: ${allChannels.length}`);
        console.log('All channels after merge:', allChannels);
        
        const newChannels = followedUsernames.filter(channel => !channels.includes(channel));
        const removedChannels = channels.filter(channel => !followedUsernames.includes(channel));
        console.log('New channels to add:', newChannels);
        console.log('Channels to remove (unfollowed):', removedChannels);
        
        if (newChannels.length > 0 || removedChannels.length > 0) {
          const existingChannelsData = await tracker.getChannelsWithData();
          const existingChannels = existingChannelsData.map(c => typeof c === 'string' ? c : c.username);
          
          const notificationData = await tracker.read([STORAGE.notificationSettings]);
          const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
          
          const updatedNotificationSettings = { ...existingNotificationSettings };
          newChannels.forEach(channel => {
            if (updatedNotificationSettings[channel] === undefined) {
              updatedNotificationSettings[channel] = false;
              console.log(`Setting default notification disabled for new channel: ${channel}`);
            }
          });
          
          removedChannels.forEach(channel => {
            if (updatedNotificationSettings[channel] !== undefined) {
              delete updatedNotificationSettings[channel];
              console.log(`Removed notification settings for unfollowed channel: ${channel}`);
            }
          });
          
          await tracker.setChannelsWithData(followedChannels);
          
          await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });
          
          channelsData = followedChannels;
          channels = followedUsernames;
          console.log(`Updated channels list: added ${newChannels.length} channels, removed ${removedChannels.length} channels`);
        } else {
          console.log('No changes in followed channels');
        }
      }
    } catch (error) {
      console.error('Auto-follow error:', error);
      console.error('Error details:', error.message, error.stack);
    }
  } else {
    console.log('Auto-follow is disabled');
  }
  
  let liveMap = {};
  
  try {
    liveMap = await tracker.fetchStatuses(channels);
    console.log('Background poll: live statuses:', liveMap);
  } catch (e) {
    console.error('poll_error', e?.message || e);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    return;
  }

  const onlineCount = Object.keys(liveMap).filter(login => liveMap[login] && liveMap[login].channel).length;
  console.log('Background poll: online count:', onlineCount);
  console.log('Live streams found:', Object.keys(liveMap).filter(login => liveMap[login] && liveMap[login].channel));
  console.log('Total channels being checked:', channels.length);
  console.log('LiveMap details:', liveMap);
  
  await tracker.updateBadge(onlineCount);
  await tracker.notifyNewLives(liveMap);

  const lastStreamTimes = await tracker.getLastStreamTimes();
  const payload = (channelsData.length ? channelsData : channels.map(u => ({ username: u }))).map((channelData) => {
    const username = typeof channelData === 'string' ? channelData : channelData.username;
    const liveData = liveMap[username] || { username };
    return {
      ...liveData,
      followedAt: typeof channelData === 'object' ? channelData.followedAt : null,
      displayName: typeof channelData === 'object' ? channelData.displayName : username,
      lastStreamTime: lastStreamTimes[username] || null
    };
  });
  
  await tracker.write({
    [STORAGE.cachedStreams]: payload,
    [STORAGE.cachedAt]: Date.now()
  });

  try {
    chrome.runtime.sendMessage({ type: 'streams:update', payload }).catch((error) => {
      console.log('No popup open to receive message:', error.message);
    });
  } catch (error) {
    console.log('Error sending message:', error.message);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tsn_poll_v1') performPollAndBroadcast();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed, setting up background polling...');
  const settingsObj = await tracker.read([STORAGE.settings]);
  const settings = settingsObj[STORAGE.settings] || {};
  const period = Math.max(1, Number(settings.pollMinutes || 1));
  console.log('Poll period set to:', period, 'minutes');
  
  await chrome.alarms.clear('tsn_poll_v1');
  chrome.alarms.create('tsn_poll_v1', { periodInMinutes: period });
  console.log('Created polling alarm with period:', period, 'minutes');
  
  await tracker.startCountdown(period);
  
  const channels = await tracker.getChannels();
  if (channels && channels.length > 0) {
    console.log('Performing immediate poll with channels:', channels);
    setTimeout(() => {
      performPollAndBroadcast();
    }, 1000);
  } else {
    console.log('No channels configured, clearing badge');
    await tracker.updateBadge(0);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension startup, setting up background polling...');
  const settingsObj = await tracker.read([STORAGE.settings]);
  const settings = settingsObj[STORAGE.settings] || {};
  const period = Math.max(1, Number(settings.pollMinutes || 1));
  console.log('Startup poll period set to:', period, 'minutes');
  
  await chrome.alarms.clear('tsn_poll_v1');
  chrome.alarms.create('tsn_poll_v1', { periodInMinutes: period });
  console.log('Created startup polling alarm with period:', period, 'minutes');
  
  await tracker.startCountdown(period);
  
  const channels = await tracker.getChannels();
  console.log('Startup: channels found:', channels);
  
  setTimeout(() => {
    console.log('Performing immediate startup poll...');
    performPollAndBroadcast();
  }, 1000);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Notification clicked:', notificationId);
  
  let channelName = null;
  if (notificationId.startsWith('live_')) {
    const parts = notificationId.split('_');
    if (parts.length >= 2) {
      channelName = parts[1];
    }
  } else if (notificationId.startsWith('immediate_')) {
    const parts = notificationId.split('_');
    if (parts.length >= 2) {
      channelName = parts[1];
    }
  }
  
  if (channelName) {
    const url = `https://www.twitch.tv/${channelName}`;
    console.log('Opening Twitch channel:', url);
    chrome.tabs.create({ url });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'streams:list') {
      try {
        const cached = await tracker.read([STORAGE.cachedStreams, STORAGE.cachedAt, STORAGE.settings, STORAGE.accessToken, STORAGE.tokenExpiry]);
        let payload = cached[STORAGE.cachedStreams] || [];
        const cachedAt = cached[STORAGE.cachedAt] || 0;
        const settings = cached[STORAGE.settings] || {};
        const maxAgeMs = Math.max(1, Number(settings.pollMinutes || 1)) * 60 * 1000;
        const isStale = Date.now() - cachedAt > maxAgeMs;

        let storedChannels = await tracker.getChannels();
        if (!Array.isArray(storedChannels) || storedChannels.length === 0) {
          if (payload.length > 0) {
            payload = [];
            await tracker.write({ [STORAGE.cachedStreams]: [], [STORAGE.cachedAt]: Date.now() });
          }
          sendResponse({ payload, cachedAt: Date.now() });
          return;
        }

        const token = cached[STORAGE.accessToken];
        const expiry = cached[STORAGE.tokenExpiry];
        const hasValidToken = token && expiry && Date.now() < expiry;
        const needsEnrich = payload.some(item => !item?.displayName || !item?.followedAt);

        if (hasValidToken && (payload.length === 0 || needsEnrich)) {
          try {
            const followed = await tracker.getFollowedChannels(token);
            const map = new Map(followed.map(c => [String(c.username).toLowerCase(), c]));
            if (payload.length === 0) {
              payload = followed.map(c => ({ username: c.username, channel: undefined, displayName: c.displayName, followedAt: c.followedAt, lastStreamTime: null }));
            } else {
              payload = payload.map(item => {
                const login = String(item?.username || '').toLowerCase();
                const info = map.get(login);
                if (!info) return item;
                return {
                  ...item,
                  displayName: item.displayName || info.displayName || login,
                  followedAt: item.followedAt || info.followedAt || null
                };
              });
            }
            const missingNameLogins = payload
              .filter(p => !p.displayName || p.displayName.toLowerCase() === String(p.username || '').toLowerCase())
              .map(p => String(p.username || '').toLowerCase());
            if (missingNameLogins.length > 0) {
              const batchSize = 100;
              for (let i = 0; i < missingNameLogins.length; i += batchSize) {
                const batch = missingNameLogins.slice(i, i + batchSize);
                const url = new URL(`${TWITCH_API_BASE}/users`);
                batch.forEach(login => url.searchParams.append('login', login));
                const resp = await fetch(url.toString(), {
                  headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID }
                });
                if (resp.ok) {
                  const data = await resp.json();
                  const users = data?.data || [];
                  const loginToDisplay = new Map(users.map(u => [String(u.login).toLowerCase(), u.display_name]));
                  payload = payload.map(p => {
                    const l = String(p.username || '').toLowerCase();
                    const dn = loginToDisplay.get(l);
                    return dn && (!p.displayName || p.displayName.toLowerCase() === l) ? { ...p, displayName: dn } : p;
                  });
                }
              }
            }
            await tracker.write({ [STORAGE.cachedStreams]: payload, [STORAGE.cachedAt]: Date.now() });
          } catch (e) {
            console.log('Enrich followed data failed:', e?.message || e);
          }
        }

        sendResponse({ payload, cachedAt });

        if (isStale) {
          setTimeout(() => {
            performPollAndBroadcast();
          }, 0);
        }
      } catch (e) {
        console.error('Error in streams:list:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'test:notification') {
      try {
        chrome.notifications.create('test_notification', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
            title: chrome.i18n.getMessage('testNotificationTitle'),
            message: chrome.i18n.getMessage('testNotificationMessage')
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'auth:start') {
      try {
        await tracker.authorizeUser();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'auth:check') {
      try {
        const data = await tracker.read([STORAGE.accessToken, STORAGE.tokenExpiry]);
        const token = data[STORAGE.accessToken];
        const expiry = data[STORAGE.tokenExpiry];
        const authorized = token && expiry && Date.now() < expiry;
        
        if (token && expiry && (expiry - Date.now()) < (7 * 24 * 60 * 60 * 1000)) {
          console.log('Token will expire soon, but still valid for now');
        }
        
        sendResponse({ authorized });
      } catch (e) {
        console.log('Auth check error:', e);
        sendResponse({ authorized: false });
      }
      return;
    }
    if (msg?.type === 'auth:revoke') {
      try {
        await tracker.write({
          [STORAGE.accessToken]: null,
          [STORAGE.tokenExpiry]: null
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'notification:get') {
      try {
        console.log('Getting notification settings...');
        const data = await tracker.read([STORAGE.notificationSettings]);
        const notificationSettings = data[STORAGE.notificationSettings] || {};
        console.log('Current notification settings:', notificationSettings);
        sendResponse({ settings: notificationSettings });
      } catch (e) {
        console.error('Error getting notification settings:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'notification:save') {
      try {
        console.log('Saving notification setting:', msg);
        
        if (msg.settings) {
          console.log('Saving full notification settings:', msg.settings);
          await tracker.write({ [STORAGE.notificationSettings]: msg.settings });
        } else if (msg.channelId !== undefined) {
          const data = await tracker.read([STORAGE.notificationSettings]);
          const notificationSettings = data[STORAGE.notificationSettings] || {};
          notificationSettings[msg.channelId] = msg.enabled;
          console.log('Updated notification settings:', notificationSettings);
          await tracker.write({ [STORAGE.notificationSettings]: notificationSettings });
        }
        sendResponse({ ok: true });
      } catch (e) {
        console.error('Error saving notification settings:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'notification:checkChannel') {
      try {
        console.log('Checking channel status for immediate notification:', msg.channelId);
        
        const settingsObj = await tracker.read([STORAGE.settings]);
        const settings = settingsObj[STORAGE.settings] || {};
        
        if (settings.muteNotifications) {
          console.log('Notifications are globally muted, skipping immediate notification');
          sendResponse({ isLive: false, muted: true });
          return;
        }
        
        const liveMap = await tracker.fetchStatuses([msg.channelId]);
        const isLive = liveMap[msg.channelId] && liveMap[msg.channelId].channel;
        
        if (isLive) {
          const stream = liveMap[msg.channelId];
          console.log(`Sending immediate notification for ${msg.channelId}: ${stream.channel.display_name}`);
          
          chrome.notifications.create(`immediate_${msg.channelId}_${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: chrome.i18n.getMessage('streamLiveNotification', [stream.channel.display_name]),
            message: `${stream.channel.status} — ${stream.game}`
          });
          
          const lastTimes = await tracker.read([STORAGE.lastNotifiedAt]);
          const updatedLastTimes = lastTimes[STORAGE.lastNotifiedAt] || {};
          updatedLastTimes[msg.channelId] = Date.now();
          await tracker.write({ [STORAGE.lastNotifiedAt]: updatedLastTimes });
        }
        
        sendResponse({ isLive });
      } catch (e) {
        console.error('Error checking channel status:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'settings:get') {
      const obj = await tracker.read([STORAGE.settings]);
      const settings = obj[STORAGE.settings] || {};
      if (settings.hideOffline === undefined) {
        settings.hideOffline = true;
      }
      sendResponse({ settings });
      return;
    }
    if (msg?.type === 'settings:save') {
      try {
        const existingData = await tracker.read([STORAGE.settings]);
        const existingSettings = existingData[STORAGE.settings] || {};
        
        const next = Object.assign({}, existingSettings, msg.settings || {});
        
        next.pollMinutes = Math.max(1, Number(next.pollMinutes || 1));
        if (next.hideOffline === undefined) {
          next.hideOffline = true;
        }
        
        
        if (next.translationEnabled === undefined) {
          next.translationEnabled = false;
        }
        if (!next.translationProvider) {
          next.translationProvider = 'microsoft';
        }
        if (!next.targetLanguage) {
          next.targetLanguage = 'en';
        }
        if (!next.customPrefix) {
          next.customPrefix = '';
        }
        
        await tracker.write({ [STORAGE.settings]: next });
        await chrome.alarms.clear('tsn_poll_v1');
        chrome.alarms.create('tsn_poll_v1', { periodInMinutes: next.pollMinutes });
        
        await tracker.startCountdown(next.pollMinutes);
        
        sendResponse({ ok: true, settings: next });
      } catch (e) {
        console.error('Error saving settings:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'streams:add') {
      const settingsObj = await tracker.read([STORAGE.settings]);
      const settings = settingsObj[STORAGE.settings] || {};
      
      if (settings.autoFollow) {
        sendResponse({ error: '自動抓取已啟用，無法手動添加頻道' });
        return;
      }
      
      const currentChannels = await tracker.getChannels();
      const newUsernames = msg.usernames || [];
      
      const actuallyNewChannels = newUsernames.filter(username => !currentChannels.includes(username.toLowerCase()));
      
      const next = await tracker.setChannels([...newUsernames].concat(currentChannels));
      
      if (actuallyNewChannels.length > 0) {
        const notificationData = await tracker.read([STORAGE.notificationSettings]);
        const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
        
        const updatedNotificationSettings = { ...existingNotificationSettings };
        actuallyNewChannels.forEach(channel => {
          if (updatedNotificationSettings[channel.toLowerCase()] === undefined) {
            updatedNotificationSettings[channel.toLowerCase()] = true;
            console.log(`Setting default notification enabled for manually added channel: ${channel}`);
          }
        });
        
        await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });
      }
      
      sendResponse({ ok: true, channels: next });
      setTimeout(() => {
        performPollAndBroadcast();
      }, 500);
      await tracker.write({ [STORAGE.cachedAt]: 0 });
      return;
    }
    if (msg?.type === 'streams:save') {
      const settingsObj = await tracker.read([STORAGE.settings]);
      const settings = settingsObj[STORAGE.settings] || {};
      
      if (settings.autoFollow) {
        sendResponse({ error: '自動抓取已啟用，無法手動管理頻道' });
        return;
      }
      
      const currentChannels = await tracker.getChannels();
      const newUsernames = msg.usernames || [];
      
      const actuallyNewChannels = newUsernames.filter(username => !currentChannels.includes(username.toLowerCase()));
      
      const next = await tracker.setChannels(newUsernames);
      
      if (actuallyNewChannels.length > 0) {
        const notificationData = await tracker.read([STORAGE.notificationSettings]);
        const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
        
        const updatedNotificationSettings = { ...existingNotificationSettings };
        actuallyNewChannels.forEach(channel => {
          if (updatedNotificationSettings[channel.toLowerCase()] === undefined) {
            updatedNotificationSettings[channel.toLowerCase()] = true;
            console.log(`Setting default notification enabled for saved channel: ${channel}`);
          }
        });
        
        await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });
      }
      
      sendResponse({ ok: true, channels: next });
      setTimeout(() => {
        performPollAndBroadcast();
      }, 500);
      await tracker.write({ [STORAGE.cachedAt]: 0 });
      return;
    }
    if (msg?.type === 'save_channels') {
      const { channels } = msg.payload || {};
      const currentChannels = await tracker.getChannels();
      const newChannels = Array.isArray(channels) ? channels : [];
      
      const actuallyNewChannels = newChannels.filter(channel => !currentChannels.includes(channel.toLowerCase()));
      
      const next = await tracker.setChannels(newChannels);
      
      if (actuallyNewChannels.length > 0) {
        const notificationData = await tracker.read([STORAGE.notificationSettings]);
        const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
        
        const updatedNotificationSettings = { ...existingNotificationSettings };
        actuallyNewChannels.forEach(channel => {
          if (updatedNotificationSettings[channel.toLowerCase()] === undefined) {
            updatedNotificationSettings[channel.toLowerCase()] = true;
            console.log(`Setting default notification enabled for saved channel: ${channel}`);
          }
        });
        
        await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });
      }
      
      sendResponse({ ok: true, channels: next });
      performPollAndBroadcast();
      return;
    }
    if (msg?.type === 'streams:remove') {
      const settingsObj = await tracker.read([STORAGE.settings]);
      const settings = settingsObj[STORAGE.settings] || {};
      
      if (settings.autoFollow) {
        sendResponse({ error: '自動抓取已啟用，無法手動移除頻道' });
        return;
      }
      
      const existing = await tracker.getChannels();
      const next = existing.filter((c) => c !== msg.username?.toLowerCase());
      await tracker.setChannels(next);
      
      const notificationData = await tracker.read([STORAGE.notificationSettings]);
      const notificationSettings = notificationData[STORAGE.notificationSettings] || {};
      if (notificationSettings[msg.username]) {
        delete notificationSettings[msg.username];
        await tracker.write({ [STORAGE.notificationSettings]: notificationSettings });
      }
      
      sendResponse({ ok: true, channels: next });
      setTimeout(() => {
        performPollAndBroadcast();
      }, 500);
      try {
        const cache = await tracker.read([STORAGE.cachedStreams]);
        const cachedPayload = Array.isArray(cache[STORAGE.cachedStreams]) ? cache[STORAGE.cachedStreams] : [];
        const filtered = cachedPayload.filter((item) => (item?.username || '').toLowerCase() !== (msg.username || '').toLowerCase());
        await tracker.write({ [STORAGE.cachedStreams]: filtered, [STORAGE.cachedAt]: Date.now() });
        try { chrome.runtime.sendMessage({ type: 'streams:update', payload: filtered }); } catch (_) {}
      } catch (e) {
        console.log('Cache update after remove failed:', e?.message || e);
      }
      return;
    }
    if (msg?.type === 'streams:deleteAll') {
      const settingsObj = await tracker.read([STORAGE.settings]);
      const settings = settingsObj[STORAGE.settings] || {};
      
      if (settings.autoFollow) {
        sendResponse({ error: '自動抓取已啟用，無法手動刪除頻道' });
        return;
      }
      
      await tracker.setChannels([]);
      await tracker.write({ 
        [STORAGE.notificationSettings]: {},
        [STORAGE.followDates]: {},
        [STORAGE.lastStreamTimes]: {},
        [STORAGE.cachedStreams]: [],
        [STORAGE.cachedAt]: Date.now()
      });
      try { await chrome.storage.local.set({ tsn_user_desc_cache: {} }); } catch (_) {}
      sendResponse({ ok: true, channels: [] });
      await tracker.updateBadge(0);
      try { chrome.runtime.sendMessage({ type: 'streams:update', payload: [] }); } catch (_) {}
      return;
    }
    if (msg?.type === 'test:autoFollow') {
      try {
        console.log('Testing auto-follow functionality...');
        const accessToken = await tracker.getAccessToken();
        if (!accessToken) {
          sendResponse({ error: '需要先授權 Twitch 帳號才能使用自動抓取功能' });
          return;
        }
        console.log('Access token obtained for test, fetching followed channels...');
        
        const followedChannels = await tracker.getFollowedChannels(accessToken);
        console.log('Test - Followed channels:', followedChannels);
        
        const followedUsernames = followedChannels.map(channel => channel.username);
        
        const currentChannels = await tracker.getChannels();
        console.log('Test - Current channels:', currentChannels);
        
        const newChannels = followedUsernames.filter(channel => !currentChannels.includes(channel));
        const removedChannels = currentChannels.filter(channel => !followedUsernames.includes(channel));
        
        console.log('Test - Followed channels:', followedChannels);
        console.log('Test - New channels to add:', newChannels);
        console.log('Test - Channels to remove (unfollowed):', removedChannels);
        
        if (newChannels.length > 0 || removedChannels.length > 0) {
          const notificationData = await tracker.read([STORAGE.notificationSettings]);
          const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
          
          const updatedNotificationSettings = { ...existingNotificationSettings };
          newChannels.forEach(channel => {
            if (updatedNotificationSettings[channel] === undefined) {
              updatedNotificationSettings[channel] = false;
              console.log(`Test - Setting default notification disabled for new channel: ${channel}`);
            }
          });
          
          removedChannels.forEach(channel => {
            if (updatedNotificationSettings[channel] !== undefined) {
              delete updatedNotificationSettings[channel];
              console.log(`Test - Removed notification settings for unfollowed channel: ${channel}`);
            }
          });
          
          await tracker.setChannels(followedUsernames);
          
          await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });
          
          setTimeout(() => {
            performPollAndBroadcast();
          }, 500);
        }
        
        sendResponse({ ok: true, count: followedChannels.length, newCount: newChannels.length, removedCount: removedChannels.length });
      } catch (e) {
        console.error('Test auto-follow error:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'auth:getUserInfo') {
      try {
        const accessToken = await tracker.getAccessToken();
        if (!accessToken) {
          sendResponse({ error: 'No access token available' });
          return;
        }
        
        const userResponse = await fetch(`${TWITCH_API_BASE}/users`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID
          }
        });
        
        if (!userResponse.ok) {
          throw new Error(`Failed to get user info: ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) {
          throw new Error('No user data found');
        }
        
        const userInfo = userData.data[0];
        sendResponse({ 
          userInfo: {
            id: userInfo.id,
            login: userInfo.login,
            display_name: userInfo.display_name,
            description: userInfo.description,
            profile_image_url: userInfo.profile_image_url,
            email: userInfo.email,
            created_at: userInfo.created_at
          }
        });
      } catch (e) {
        console.error('Error getting user info:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'users:getInfoBatch') {
      try {
        const logins = Array.isArray(msg.logins) ? msg.logins.filter(Boolean) : [];
        if (logins.length === 0) {
          sendResponse({ ok: true, users: {} });
          return;
        }
        const accessToken = await tracker.getAccessToken();
        if (!accessToken) {
          sendResponse({ error: 'No access token available' });
          return;
        }
        const batchSize = 100;
        const resultMap = {};
        for (let i = 0; i < logins.length; i += batchSize) {
          const batch = logins.slice(i, i + batchSize);
          const url = new URL(`${TWITCH_API_BASE}/users`);
          batch.forEach(login => url.searchParams.append('login', String(login).toLowerCase()));
          const resp = await fetch(url.toString(), {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Client-Id': TWITCH_CLIENT_ID
            }
          });
          if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`users lookup failed: ${resp.status} ${t}`);
          }
          const data = await resp.json();
          const users = data?.data || [];
          users.forEach(u => {
            resultMap[String(u.login).toLowerCase()] = {
              id: u.id,
              login: u.login,
              display_name: u.display_name,
              description: u.description || ''
            };
          });
          if (i + batchSize < logins.length) {
            await new Promise(r => setTimeout(r, 60));
          }
        }
        sendResponse({ ok: true, users: resultMap });
      } catch (e) {
        console.error('users:getInfoBatch error:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'settings:export') {
      try {
        console.log('Exporting settings...');
        
        const allData = await tracker.read([
          STORAGE.settings,
          STORAGE.channels,
          STORAGE.notificationSettings,
          STORAGE.followDates,
          STORAGE.lastStreamTimes
        ]);
        
        const localTimestamp = (() => {
          try {
            const lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : undefined;
            return new Date().toLocaleString(lang);
          } catch (_) {
            return new Date().toLocaleString();
          }
        })();

        const exportData = {
          version: '1.0',
          timestamp: localTimestamp,
          settings: allData[STORAGE.settings] || {},
          channels: allData[STORAGE.channels] || [],
          notificationSettings: allData[STORAGE.notificationSettings] || {},
          followDates: allData[STORAGE.followDates] || {},
          lastStreamTimes: allData[STORAGE.lastStreamTimes] || {}
        };
        
        console.log('Settings exported:', exportData);
        sendResponse({ ok: true, data: exportData });
      } catch (e) {
        console.error('Error exporting settings:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'settings:import') {
      try {
        console.log('Importing settings...', msg.data);
        
        if (!msg.data || typeof msg.data !== 'object') {
          throw new Error('Invalid import data format');
        }
        
        const importData = msg.data;
        
        if (!importData.version) {
          throw new Error('Missing version information');
        }
        
        const importPromises = [];
        
        if (importData.settings) {
          importPromises.push(tracker.write({ [STORAGE.settings]: importData.settings }));
        }
        
        if (importData.channels) {
          importPromises.push(tracker.write({ [STORAGE.channels]: importData.channels }));
        }
        
        if (importData.notificationSettings) {
          importPromises.push(tracker.write({ [STORAGE.notificationSettings]: importData.notificationSettings }));
        }
        
        if (importData.followDates) {
          importPromises.push(tracker.write({ [STORAGE.followDates]: importData.followDates }));
        }
        
        if (importData.lastStreamTimes) {
          importPromises.push(tracker.write({ [STORAGE.lastStreamTimes]: importData.lastStreamTimes }));
        }
        
        await Promise.all(importPromises);
        
        const settings = importData.settings || {};
        const period = Math.max(1, Number(settings.pollMinutes || 1));
        await chrome.alarms.clear('tsn_poll_v1');
        chrome.alarms.create('tsn_poll_v1', { periodInMinutes: period });
        
        await tracker.startCountdown(period);
        
        setTimeout(() => {
          try {
            performPollAndBroadcast();
          } catch (e) {
            console.error('Error performing poll after import:', e);
          }
        }, 0);
        
        console.log('Settings imported successfully');
        sendResponse({ ok: true });
      } catch (e) {
        console.error('Error importing settings:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'countdown:get') {
      try {
        const remaining = await tracker.getCountdownRemaining();
        sendResponse({ ok: true, remaining });
      } catch (e) {
        console.error('Error getting countdown:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.action === 'openSettings') {
      try {
        chrome.tabs.create({
          url: chrome.runtime.getURL('popup.html#settings')
        });
        sendResponse({ success: true });
      } catch (e) {
        console.error('Error opening settings:', e);
        sendResponse({ success: false, error: String(e?.message || e) });
      }
      return;
    }
  })();
  return true;
});


