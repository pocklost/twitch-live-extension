const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const TWITCH_OAUTH_BASE = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_BASE = 'https://id.twitch.tv/oauth2/token';

const TWITCH_CLIENT_ID = 'pujtelt7e3go829amtruwhoeido1rx';
const REDIRECT_URI = chrome.identity ? chrome.identity.getRedirectURL() : 'https://www.twitch.tv';

// Kick (client-credentials public polling)
const KICK_PUBLIC_CHANNEL_API = 'https://api.kick.com/public/v1/channels?slug=';
const KICK_OAUTH_TOKEN_BASE = 'https://id.kick.com/oauth/token';
const KICK_CLIENT_ID = '01K36JDZPC2X6DM9YN8NBJDMCH';
const KICK_CLIENT_SECRET = '1772e9969e4a9f42853975c66cb5b3c54f2aba8e2b6de2ba34179f83ff53ced5';
const AUTO_AUTH_BLOCK_MS = 12 * 60 * 60 * 1000;

const STORAGE = {
  channels: 'tsn_channels',
  kickChannels: 'tsn_kick_channels',
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
  kickAppAccessToken: 'tsn_kick_app_access_token',
  kickAppTokenExpiry: 'tsn_kick_app_token_expiry',
  countdownStartTime: 'tsn_countdown_start_time',
  pollInterval: 'tsn_poll_interval',
  authAutoBlockedUntil: 'tsn_auth_auto_blocked_until',
  authBlockReason: 'tsn_auth_block_reason'
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

  async getKickChannels() {
    const data = await this.read([STORAGE.kickChannels]);
    return Array.isArray(data[STORAGE.kickChannels]) ? data[STORAGE.kickChannels] : [];
  }

  async setKickChannels(channels) {
    const list = Array.from(new Set((channels || []).map((c) => String(c).toLowerCase().trim()).filter(Boolean)));
    await this.write({ [STORAGE.kickChannels]: list });
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

  async setAutoAuthBlocked(reason = 'unknown', blockMs = AUTO_AUTH_BLOCK_MS) {
    const blockedUntil = Date.now() + blockMs;
    await this.write({
      [STORAGE.authAutoBlockedUntil]: blockedUntil,
      [STORAGE.authBlockReason]: reason
    });
  }

  async clearAutoAuthBlocked() {
    await this.write({
      [STORAGE.authAutoBlockedUntil]: null,
      [STORAGE.authBlockReason]: null
    });
  }

  async handleUnauthorizedToken(reason = 'token_invalid') {
    await this.write({
      [STORAGE.accessToken]: null,
      [STORAGE.tokenExpiry]: null
    });
    await this.setAutoAuthBlocked(reason);
  }

  async validateAccessToken(accessToken) {
    if (!accessToken) return { valid: false, reason: 'missing_token' };
    try {
      const response = await fetch(`${TWITCH_API_BASE}/users`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      });
      if (response.ok) {
        return { valid: true };
      }
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'token_invalid' };
      }
      return { valid: false, reason: `http_${response.status}`, retriable: true };
    } catch (error) {
      console.log('validateAccessToken network error:', error?.message || error);
      return { valid: false, reason: 'network_error', retriable: true };
    }
  }

  async ensureAccessToken(options = {}) {
    const { interactive = false, source = 'auto' } = options;
    const existing = await this.getAccessToken();
    if (existing) return existing;

    if (!interactive) return null;

    if (source !== 'manual') {
      const authState = await this.read([STORAGE.authAutoBlockedUntil, STORAGE.authBlockReason]);
      const blockedUntil = Number(authState[STORAGE.authAutoBlockedUntil] || 0);
      if (blockedUntil > Date.now()) {
        const reason = authState[STORAGE.authBlockReason] || 'unknown';
        console.log(`Auto auth blocked until ${new Date(blockedUntil).toISOString()} (reason: ${reason})`);
        return null;
      }
    }

    try {
      const fresh = await this.authorizeUser({ source });
      return fresh;
    } catch (error) {
      if (source !== 'manual') {
        await this.setAutoAuthBlocked('authorize_failed');
        return null;
      }
      throw error;
    }
  }

  async authorizeUser(options = {}) {
    const { source = 'manual' } = options;
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
      const win = await chrome.windows.create({ url: authUrl, type: 'popup', width: 600, height: 800, focused: true });
      const windowId = win.id;
      let tabs = await chrome.tabs.query({ windowId });
      const tabId = tabs && tabs[0] ? tabs[0].id : null;
      if (!tabId) throw new Error('Authorization popup tab not found');

      return new Promise((resolve, reject) => {
        const checkTab = async () => {
          try {
            const currentTab = await chrome.tabs.get(tabId);
            if (!currentTab || !currentTab.url) {
              setTimeout(checkTab, 1000);
              return;
            }
            if (currentTab.url.includes('access_token=')) {
              const url = new URL(currentTab.url);
              const fragment = url.hash.substring(1);
              const params = new URLSearchParams(fragment);
              const accessToken = params.get('access_token');
              if (accessToken) {
                await this.write({
                  [STORAGE.accessToken]: accessToken,
                  [STORAGE.tokenExpiry]: Date.now() + (365 * 24 * 60 * 60 * 1000),
                  [STORAGE.authAutoBlockedUntil]: null,
                  [STORAGE.authBlockReason]: null
                });
                await chrome.tabs.update(tabId, { url: chrome.runtime.getURL('authorization-success.html') });
                console.log('User authorized successfully');
                resolve(accessToken);
                return;
              } else {
                await chrome.windows.remove(windowId);
                reject(new Error('No access token received'));
                return;
              }
            } else if (currentTab.url.includes('error=')) {
              await chrome.windows.remove(windowId);
              reject(new Error('Authorization was denied or failed'));
              return;
            } else {
              setTimeout(checkTab, 1000);
            }
          } catch (e) {
            reject(new Error('Authorization window was closed or not accessible'));
          }
        };
        setTimeout(checkTab, 2000);
      });
    } catch (error) {
      console.error('Authorization failed:', error);
      if (source !== 'manual') {
        await this.setAutoAuthBlocked('authorize_failed');
      }
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
      const accessToken = await this.ensureAccessToken({ interactive: true, source: 'auto' });
      if (!accessToken) {
        console.log('No token available for automatic fetch, skipping interactive auth.');
        return {};
      }
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
      
      const userIdArray = Object.values(userIds).map(user => user.id);
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
          if (response.status === 401) {
            await this.handleUnauthorizedToken('token_invalid');
          }
          console.error(`Twitch API failed for batch ${Math.floor(i / batchSize) + 1}: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Twitch API failed for batch ${Math.floor(i / batchSize) + 1}: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        const streams = data.data || [];
        
        for (const stream of streams) {
          const login = stream.user_login.toLowerCase();
          if (lower.includes(login)) {
            const userInfo = userIds[login];
            result[login] = {
              username: login,
              channel: {
                display_name: stream.user_name,
                status: stream.title,
                profile_image_url: userInfo ? userInfo.profile_image_url : null
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
        if (response.status === 401) {
          await this.handleUnauthorizedToken('token_invalid');
        }
        console.error(`User lookup failed for batch: ${response.status} ${response.statusText}`);
        throw new Error(`User lookup failed: ${response.status}`);
      }
      
      const data = await response.json();
      const users = data.data || [];
      
      for (const user of users) {
        result[user.login.toLowerCase()] = {
          id: user.id,
          profile_image_url: user.profile_image_url
        };
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
        if (userResponse.status === 401) {
          await this.handleUnauthorizedToken('token_invalid');
        }
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

  async getChannelVods(username, accessToken, limit = 20, after = null) {
    try {
      console.log(`Getting VODs for channel: ${username}`);
      
      const userResponse = await fetch(`${TWITCH_API_BASE}/users?login=${username}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      });
      
      if (!userResponse.ok) {
        if (userResponse.status === 401) {
          await this.handleUnauthorizedToken('token_invalid');
        }
        throw new Error(`Failed to get user info: ${userResponse.status}`);
      }
      
      const userData = await userResponse.json();
      if (!userData.data || userData.data.length === 0) {
        throw new Error('User not found');
      }
      
      const userId = userData.data[0].id;
      console.log(`User ID for ${username}: ${userId}`);
      
      const vodsUrl = `${TWITCH_API_BASE}/videos?user_id=${userId}&type=archive&first=${limit}${after ? `&after=${after}` : ''}`;
      console.log(`Fetching VODs from: ${vodsUrl}`);
      
      const vodsResponse = await fetch(vodsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      });
      
      if (!vodsResponse.ok) {
        const errorText = await vodsResponse.text();
        console.error(`Failed to get VODs: ${vodsResponse.status} ${vodsResponse.statusText}`, errorText);
        throw new Error(`Failed to get VODs: ${vodsResponse.status} - ${errorText}`);
      }
      
      const vodsData = await vodsResponse.json();
      console.log(`Found ${vodsData.data?.length || 0} VODs for ${username}`);
      const items = vodsData.data || [];
      const parseTokenRestricted = (val) => {
        try {
          const tok = JSON.parse(val || '{}');
          const chansub = tok?.chansub || {};
          const list = Array.isArray(chansub?.restricted_bitrates) ? chansub.restricted_bitrates : [];
          const hasHi = list.some(q => ['chunked','1080p60','1080p','900p60','720p60','720p'].includes(String(q).toLowerCase()));
          const untilZero = typeof chansub?.view_until === 'number' && chansub.view_until === 0;
          return !!(hasHi || untilZero);
        } catch (_) { return false; }
      };
      const batchedFetch = async (vodIds) => {
        const makePersistedEntry = (id) => ({
          operationName: 'PlaybackAccessToken',
          variables: { vodID: String(id), playerType: 'site' },
          extensions: { persistedQuery: { version: 1, sha256Hash: '0828119ded1c146d1b26445102f0d6c2e94c32ad9d19d9a16c76b0ae6d2a5c6d' } }
        });
        const makeQueryEntry = (id) => ({
          operationName: 'PlaybackAccessToken',
          variables: { vodID: String(id), playerType: 'site' },
          query: 'query PlaybackAccessToken($vodID: ID!, $playerType: String!) {\n  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayback", playerType: $playerType}) {\n    value\n    signature\n    __typename\n  }\n}'
        });
        const headers = { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' };
        const persistedBody = JSON.stringify(vodIds.map(makePersistedEntry));
        const r1 = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers, body: persistedBody });
        let results = [];
        let needFallback = [];
        if (r1.ok) {
          const arr = await r1.json();
          results = Array.isArray(arr) ? arr : [];
          results.forEach((res, idx) => {
            if (Array.isArray(res?.errors) && res.errors.some(e => String(e?.message).includes('PersistedQueryNotFound'))) {
              needFallback.push(vodIds[idx]);
            }
          });
        } else {
          needFallback = vodIds.slice();
        }
        if (needFallback.length > 0) {
          const fallbackBody = JSON.stringify(needFallback.map(makeQueryEntry));
          const r2 = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers, body: fallbackBody });
          if (r2.ok) {
            const arr2 = await r2.json();
            const mapIndex = new Map(needFallback.map((id, i) => [id, i]));
            vodIds.forEach((id, idx) => {
              if (needFallback.includes(id)) {
                const i2 = mapIndex.get(id);
                results[idx] = Array.isArray(arr2) ? arr2[i2] : undefined;
              }
            });
          }
        }
        const idToFlag = new Map();
        vodIds.forEach((id, idx) => {
          const res = results[idx];
          if (!res || Array.isArray(res?.errors)) {
            idToFlag.set(id, false);
          } else {
            const val = res?.data?.videoPlaybackAccessToken?.value;
            idToFlag.set(id, parseTokenRestricted(val));
          }
        });
        return idToFlag;
      };
      const batchSize = 30;
      const vodIds = items.map(v => v.id);
      const flagsMap = new Map();
      for (let i = 0; i < vodIds.length; i += batchSize) {
        const slice = vodIds.slice(i, i + batchSize);
        try {
          const part = await Promise.race([
            batchedFetch(slice),
            new Promise((resolve) => setTimeout(() => resolve(new Map(slice.map(id => [id, false]))), 2000))
          ]);
          part.forEach((val, key) => flagsMap.set(key, !!val));
        } catch (_) {
          slice.forEach(id => flagsMap.set(id, false));
        }
      }
      const enriched = items.map(v => ({ ...v, isSubscriberOnly: !!flagsMap.get(v.id) }));
      return { items: enriched, cursor: vodsData.pagination?.cursor || null };
      
    } catch (error) {
      console.error(`Error getting VODs for ${username}:`, error);
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

  async notifyNewLivesCombined(liveMap) {
    const settingsObj = await this.read([STORAGE.settings, STORAGE.notificationSettings]);
    const settings = settingsObj[STORAGE.settings] || {};
    const notificationSettings = settingsObj[STORAGE.notificationSettings] || {};

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

    const currentlyLiveIds = Object.keys(liveMap).filter((id) => liveMap[id] && liveMap[id].channel);
    const twitchLiveBySlugLower = new Set();
    currentlyLiveIds.forEach((id) => {
      if (!id || id.startsWith('kick:')) return;
      if (liveMap[id]?.channel) twitchLiveBySlugLower.add(String(id).toLowerCase());
    });

    for (const id of currentlyLiveIds) {
      if (previous[id]) continue;

      const s = liveMap[id];
      if (!s?.channel) continue;

      const isKick = id.startsWith('kick:');

      if (isKick) {
        const slugLower = id.slice('kick:'.length).toLowerCase();
        const kickKey = `kick:${slugLower}`;
        // 同名 Twitch 也正直播：只發 Twitch 通知，不發 Kick
        if (twitchLiveBySlugLower.has(slugLower)) continue;

        if (notificationSettings[kickKey] !== true) continue;

        const last = lastTimes[id] || 0;
        if (Date.now() - last <= 15 * 60 * 1000) {
          console.log(`Rate limited for ${id}, last notification: ${new Date(last).toLocaleString()}`);
          continue;
        }

        const gamePart = s.game ? ` — ${s.game}` : '';
        const message = `${s.channel.status}${gamePart}`;
        chrome.notifications.create(`kick_live_${slugLower}_${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: chrome.i18n.getMessage('streamStartedNotification', [s.channel.display_name]),
          message
        });
        lastTimes[id] = Date.now();
        continue;
      }

      // Twitch 通知
      const login = id;
      const shouldNotify = notificationSettings[login] === true;
      if (!shouldNotify) continue;

      const last = lastTimes[id] || 0;
      if (Date.now() - last <= 15 * 60 * 1000) {
        console.log(`Rate limited for ${id}, last notification: ${new Date(last).toLocaleString()}`);
        continue;
      }

      const gamePart = s.game ? ` — ${s.game}` : '';
      const message = `${s.channel.status}${gamePart}`;
      chrome.notifications.create(`live_${id}_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: chrome.i18n.getMessage('streamStartedNotification', [s.channel.display_name]),
        message
      });
      lastTimes[id] = Date.now();
    }

    const newIndex = {};
    currentlyLiveIds.forEach((l) => (newIndex[l] = true));
    await this.write({ [STORAGE.onlineIndex]: newIndex, [STORAGE.lastNotifiedAt]: lastTimes });
  }
}

const tracker = new StreamStateManager();

async function handleVodRequest(msg, sendResponse) {
  console.log('VOD request received:', msg);
  try {
    const accessToken = await tracker.ensureAccessToken({ interactive: false });
    if (!accessToken) {
      throw new Error('Not authorized');
    }
    
    console.log('Getting VODs for username:', msg.username);
    const { items, cursor } = await tracker.getChannelVods(msg.username, accessToken, msg.limit || 20, msg.after || null);
    console.log('VODs retrieved successfully:', items.length, 'cursor:', cursor);
    sendResponse({ ok: true, items, cursor });
  } catch (e) {
    console.error('Error getting VODs:', e);
    sendResponse({ error: String(e?.message || e) });
  }
}

async function getKickAppAccessToken() {
  const { [STORAGE.kickAppAccessToken]: accessToken, [STORAGE.kickAppTokenExpiry]: expiresAt } = await chrome.storage.local.get([
    STORAGE.kickAppAccessToken,
    STORAGE.kickAppTokenExpiry
  ]);

  if (accessToken && expiresAt && Date.now() < expiresAt) {
    return accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: KICK_CLIENT_ID,
    client_secret: KICK_CLIENT_SECRET
  });

  const response = await fetch(KICK_OAUTH_TOKEN_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Kick app token failed: ${response.status} - ${errorText}`);
  }

  const json = await response.json();
  const newExpiresAt = Date.now() + (Number(json.expires_in || 0) * 1000);

  await chrome.storage.local.set({
    [STORAGE.kickAppAccessToken]: json.access_token,
    [STORAGE.kickAppTokenExpiry]: newExpiresAt
  });

  return json.access_token;
}

function getKickStartedAt(channelInfo) {
  const stream = channelInfo?.stream || {};
  // Kick's payload naming can vary; keep a few fallbacks.
  const val =
    stream.started_at ||
    stream.startedAt ||
    stream.created_at ||
    stream.started_time ||
    channelInfo?.started_at ||
    channelInfo?.startedAt ||
    null;

  if (typeof val === 'number' && Number.isFinite(val)) {
    // Heuristic: treat small values as seconds.
    const ms = val < 1e12 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }

  return val;
}

async function fetchKickPublicChannelInfo(slug) {
  const appToken = await getKickAppAccessToken();
  const apiUrl = `${KICK_PUBLIC_CHANNEL_API}${encodeURIComponent(slug)}`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${appToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      await chrome.storage.local.remove([STORAGE.kickAppAccessToken, STORAGE.kickAppTokenExpiry]).catch(() => {});
    }
    const errorText = await response.text().catch(() => '');
    throw new Error(`Kick public channel failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data?.data?.[0] || null;
}

/** 角標 / 統計用：同名（不分大小寫）同時開台只算 Twitch 直播一格 */
function countDedupedLiveOnline(twitchLiveMap, kickLiveMap) {
  const twitchLiveLogins = new Set();
  let n = 0;
  for (const login of Object.keys(twitchLiveMap || {})) {
    if (twitchLiveMap[login]?.channel) {
      twitchLiveLogins.add(String(login).toLowerCase());
      n += 1;
    }
  }
  for (const key of Object.keys(kickLiveMap || {})) {
    if (!key.startsWith('kick:')) continue;
    if (!kickLiveMap[key]?.channel) continue;
    const slug = key.slice('kick:'.length).toLowerCase();
    if (twitchLiveLogins.has(slug)) continue;
    n += 1;
  }
  return n;
}

async function fetchKickStatuses(slugs, { concurrency = 8 } = {}) {
  const unique = Array.from(new Set((slugs || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean)));
  const result = {};
  unique.forEach((slug) => {
    result[`kick:${slug}`] = undefined;
  });

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const infos = await Promise.all(
      batch.map((slug) =>
        fetchKickPublicChannelInfo(slug)
          .then((info) => ({ slug, info }))
          .catch(() => ({ slug, info: null }))
      )
    );

    infos.forEach(({ slug, info }) => {
      const isLive = info?.stream?.is_live === true || info?.stream?.isLive === true;
      if (!info || !isLive) return;

      const stream = info.stream || {};
      const channel = {
        display_name: info.slug || slug,
        status: info.stream_title || stream.title || info.title || '',
        profile_image_url:
          info.profile_image_url ||
          stream.profile_image_url ||
          info?.user?.profile_image_url ||
          stream?.user?.profile_image_url ||
          null,
        // Kick 直播封面/縮圖：Kick 的欄位命名可能會變動，盡量用多種常見欄位嘗試。
        thumbnail_url:
          info.thumbnail_url ||
          info.thumbnailUrl ||
          stream.thumbnail_url ||
          stream.thumbnailUrl ||
          stream.thumbnail ||
          stream.cover_url ||
          stream.coverUrl ||
          stream.preview_url ||
          stream.previewUrl ||
          stream.image_url ||
          stream.imageUrl ||
          null
      };

      result[`kick:${slug}`] = {
        platform: 'kick',
        username: slug,
        channel,
        game: info.category?.name || info.category_name || '',
        viewers: stream.viewer_count || stream.viewers || 0,
        created_at: getKickStartedAt(info) || new Date().toISOString()
      };
    });
  }

  return result;
}

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
  
  // Kick channels are stored separately from Twitch.
  const kickStored = await chrome.storage.local.get([STORAGE.kickChannels]);
  const kickChannelsAll = Array.isArray(kickStored[STORAGE.kickChannels]) ? kickStored[STORAGE.kickChannels] : [];

  // 兼容舊版 Kick 設定：若 notificationSettings 中缺少 kick:${slug}，預設補上 true
  // 以避免升級後 Kick 通知完全失效。
  try {
    const notificationData = await tracker.read([STORAGE.notificationSettings]);
    const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
    let updated = false;
    const nextNotificationSettings = { ...existingNotificationSettings };
    (kickChannelsAll || []).forEach((slug) => {
      const s = String(slug).toLowerCase();
      if (!s) return;
      const key = `kick:${s}`;
      if (nextNotificationSettings[key] === undefined) {
        nextNotificationSettings[key] = true;
        updated = true;
      }
    });
    if (updated) {
      await tracker.write({ [STORAGE.notificationSettings]: nextNotificationSettings });
    }
  } catch (_) {}
  // 實況列表：popup 會依同名（不分大小寫）去重，有 Twitch 只顯示 Twitch。
  // 通知：同名同時開台只走 Twitch，見 notifyNewLivesCombined。
  const kickChannelsForUI = kickChannelsAll;
  const kickChannelsForNotifications = kickChannelsAll;

  let twitchLiveMap = {};
  try {
    twitchLiveMap = await tracker.fetchStatuses(channels);
    console.log('Background poll: twitch live statuses:', twitchLiveMap);
  } catch (e) {
    console.error('poll_error', e?.message || e);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    return;
  }

  let kickLiveMapForUI = {};
  try {
    kickLiveMapForUI = kickChannelsForUI.length > 0 ? await fetchKickStatuses(kickChannelsForUI) : {};
    console.log('Background poll: kick live statuses (UI):', kickLiveMapForUI);
  } catch (e) {
    console.error('kick_poll_error', e?.message || e);
  }

  let kickLiveMapForNotifications = {};
  try {
    kickLiveMapForNotifications =
      kickChannelsForNotifications.length > 0
        ? await fetchKickStatuses(kickChannelsForNotifications)
        : {};
    console.log('Background poll: kick live statuses (notify):', kickLiveMapForNotifications);
  } catch (e) {
    console.error('kick_notify_poll_error', e?.message || e);
  }

  const liveMapCombinedForUI = { ...twitchLiveMap, ...kickLiveMapForUI };
  const liveMapCombinedForNotifications = { ...twitchLiveMap, ...kickLiveMapForNotifications };

  const onlineCount = countDedupedLiveOnline(twitchLiveMap, kickLiveMapForUI);
  console.log('Background poll: combined online count:', onlineCount);
  console.log('Total channels being checked (twitch + kick(UI)):', (channels || []).length + (kickChannelsForUI || []).length);
  
  await tracker.updateBadge(onlineCount);
  await tracker.notifyNewLivesCombined(liveMapCombinedForNotifications);

  const lastStreamTimes = await tracker.getLastStreamTimes();
  const twitchPayloadBase = (channelsData.length ? channelsData : channels.map((u) => ({ username: u })));
  const twitchPayload = twitchPayloadBase.map((channelData) => {
    const username = typeof channelData === 'string' ? channelData : channelData.username;
    const liveData = twitchLiveMap[username] || { username };
    return {
      ...liveData,
      platform: 'twitch',
      followedAt: typeof channelData === 'object' ? channelData.followedAt : null,
      displayName: typeof channelData === 'object' ? channelData.displayName : username,
      lastStreamTime: lastStreamTimes[username] || null
    };
  });

  const kickPayload = kickChannelsForUI.map((slug) => {
    const key = `kick:${slug}`;
    const liveData = kickLiveMapForUI[key] || { username: slug };
    return {
      ...liveData,
      platform: 'kick',
      followedAt: null,
      displayName: slug,
      lastStreamTime: null
    };
  });

  const payload = [...twitchPayload, ...kickPayload];
  
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

  const twitchChannels = await tracker.getChannels();
  const kickData = await chrome.storage.local.get([STORAGE.kickChannels]);
  const kickChannels = Array.isArray(kickData[STORAGE.kickChannels]) ? kickData[STORAGE.kickChannels] : [];

  if ((twitchChannels && twitchChannels.length > 0) || (kickChannels && kickChannels.length > 0)) {
    console.log('Performing immediate poll with channels:', { twitch: twitchChannels, kick: kickChannels });
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

  const twitchChannels = await tracker.getChannels();
  const kickData = await chrome.storage.local.get([STORAGE.kickChannels]);
  const kickChannels = Array.isArray(kickData[STORAGE.kickChannels]) ? kickData[STORAGE.kickChannels] : [];
  console.log('Startup: channels found:', { twitch: twitchChannels, kick: kickChannels });
  
  setTimeout(() => {
    console.log('Performing immediate startup poll...');
    performPollAndBroadcast();
  }, 1000);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Notification clicked:', notificationId);

  let url = null;

  if (notificationId.startsWith('kick_live_') || notificationId.startsWith('kick_immediate_')) {
    const parts = notificationId.split('_');
    // kick_live_<slug>_<timestamp> => parts[2] = slug
    if (parts.length >= 3) {
      const slug = parts[2];
      url = `https://kick.com/${slug}`;
    }
  } else if (notificationId.startsWith('live_') || notificationId.startsWith('immediate_')) {
    const parts = notificationId.split('_');
    if (parts.length >= 2) {
      const channelName = parts[1];
      url = `https://www.twitch.tv/${channelName}`;
    }
  }

  if (url) {
    console.log('Opening notification URL:', url);
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
        const kickData = await chrome.storage.local.get([STORAGE.kickChannels]);
        const storedKickChannels = Array.isArray(kickData[STORAGE.kickChannels]) ? kickData[STORAGE.kickChannels] : [];
        const hasTwitchChannels = Array.isArray(storedChannels) && storedChannels.length > 0;
        const hasKickChannels = Array.isArray(storedKickChannels) && storedKickChannels.length > 0;
        if (!hasTwitchChannels && !hasKickChannels) {
          if (payload.length > 0) {
            payload = [];
            await tracker.write({ [STORAGE.cachedStreams]: [], [STORAGE.cachedAt]: Date.now() });
          }
          sendResponse({ payload, cachedAt: Date.now() });
          return;
        }

        // 僅剩 Kick、無 Twitch 時，舊邏輯需 hasTwitchChannels 才會從 API 補列表，cached 會一直為空。
        if (payload.length === 0 && hasKickChannels && !hasTwitchChannels) {
          payload = storedKickChannels.map((slug) => ({
            username: slug,
            platform: 'kick',
            channel: undefined,
            displayName: slug,
            followedAt: null,
            lastStreamTime: null
          }));
          await tracker.write({ [STORAGE.cachedStreams]: payload, [STORAGE.cachedAt]: Date.now() });
        }

        const token = cached[STORAGE.accessToken];
        const expiry = cached[STORAGE.tokenExpiry];
        const hasValidToken = token && expiry && Date.now() < expiry;
        const isTwitchItem = (item) => !item?.platform || item.platform === 'twitch';
        const needsEnrich = payload.some(item => isTwitchItem(item) && (!item?.displayName || !item?.followedAt));

        if (hasValidToken && hasTwitchChannels && (payload.length === 0 || needsEnrich)) {
          try {
            const followed = await tracker.getFollowedChannels(token);
            const map = new Map(followed.map(c => [String(c.username).toLowerCase(), c]));
            if (payload.length === 0) {
              payload = followed.map(c => ({ username: c.username, channel: undefined, displayName: c.displayName, followedAt: c.followedAt, lastStreamTime: null }));
              if (hasKickChannels) {
                payload = payload.concat(storedKickChannels.map((slug) => ({
                  username: slug,
                  platform: 'kick',
                  channel: undefined,
                  displayName: slug,
                  followedAt: null,
                  lastStreamTime: null
                })));
              }
            } else {
              payload = payload.map(item => {
                if (!isTwitchItem(item)) return item;
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
              .filter(p => isTwitchItem(p) && (!p.displayName || p.displayName.toLowerCase() === String(p.username || '').toLowerCase()))
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
        await tracker.authorizeUser({ source: 'manual' });
        setTimeout(() => {
          performPollAndBroadcast().catch((e) => {
            console.error('Immediate refresh after auth failed:', e);
          });
        }, 0);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'auth:check') {
      try {
        const data = await tracker.read([
          STORAGE.accessToken,
          STORAGE.tokenExpiry,
          STORAGE.authAutoBlockedUntil,
          STORAGE.authBlockReason
        ]);
        const token = data[STORAGE.accessToken];
        const expiry = data[STORAGE.tokenExpiry];
        let authorized = token && expiry && Date.now() < expiry;
        let blockedUntil = Number(data[STORAGE.authAutoBlockedUntil] || 0);
        let blockReason = data[STORAGE.authBlockReason] || '';

        if (authorized) {
          const validation = await tracker.validateAccessToken(token);
          if (!validation.valid && !validation.retriable) {
            await tracker.handleUnauthorizedToken(validation.reason || 'token_invalid');
            authorized = false;
            blockedUntil = Date.now() + AUTO_AUTH_BLOCK_MS;
            blockReason = validation.reason || 'token_invalid';
          }
        }
        
        if (token && expiry && (expiry - Date.now()) < (7 * 24 * 60 * 60 * 1000)) {
          console.log('Token will expire soon, but still valid for now');
        }
        
        sendResponse({
          authorized,
          blockedUntil,
          blockReason,
          needsManualLogin: !authorized && blockedUntil > Date.now()
        });
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
          [STORAGE.tokenExpiry]: null,
          [STORAGE.authAutoBlockedUntil]: null,
          [STORAGE.authBlockReason]: null
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

        const channelId = String(msg.channelId || '');

        // ---- Kick immediate ----
        if (channelId.startsWith('kick:')) {
          const slugLower = channelId.slice('kick:'.length).toLowerCase();
          const kickId = `kick:${slugLower}`;

          const liveKickMap = await fetchKickStatuses([slugLower]);
          const isKickLive = liveKickMap[kickId] && liveKickMap[kickId].channel;

          if (isKickLive) {
            let isTwitchLive = false;
            try {
              const liveTwitchMap = await tracker.fetchStatuses([slugLower]);
              isTwitchLive = !!(liveTwitchMap[slugLower] && liveTwitchMap[slugLower].channel);
            } catch (_) {}

            // 同名 Twitch 也正直播：不發 Kick 立即通知（只走 Twitch 通知）
            if (!isTwitchLive) {
              const kickStream = liveKickMap[kickId];
              const kickGamePart = kickStream?.game ? ` — ${kickStream.game}` : '';
              const kickMessage = `${kickStream.channel.status}${kickGamePart}`;

              chrome.notifications.create(`kick_immediate_${slugLower}_${Date.now()}`, {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: chrome.i18n.getMessage('streamLiveNotification', [kickStream.channel.display_name || slugLower]),
                message: kickMessage
              });

              const lastTimes = await tracker.read([STORAGE.lastNotifiedAt]);
              const updatedLastTimes = lastTimes[STORAGE.lastNotifiedAt] || {};
              updatedLastTimes[kickId] = Date.now();
              await tracker.write({ [STORAGE.lastNotifiedAt]: updatedLastTimes });
            }
          }

          sendResponse({ isLive: isKickLive });
          return;
        }

        // ---- Twitch immediate (existing) ----
        const liveMap = await tracker.fetchStatuses([channelId]);
        const isLive = liveMap[channelId] && liveMap[channelId].channel;
        
        if (isLive) {
          const stream = liveMap[channelId];
          console.log(`Sending immediate notification for ${channelId}: ${stream.channel.display_name}`);
          
          chrome.notifications.create(`immediate_${channelId}_${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: chrome.i18n.getMessage('streamLiveNotification', [stream.channel.display_name]),
            message: `${stream.channel.status} — ${stream.game}`
          });
          
          const lastTimes = await tracker.read([STORAGE.lastNotifiedAt]);
          const updatedLastTimes = lastTimes[STORAGE.lastNotifiedAt] || {};
          updatedLastTimes[channelId] = Date.now();
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
      if (settings.autoBonusEnabled === undefined) settings.autoBonusEnabled = true;
      if (settings.chattersCountEnabled === undefined) settings.chattersCountEnabled = false;
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
        if (next.autoBonusEnabled === undefined) {
          next.autoBonusEnabled = true;
        }
        if (next.chattersCountEnabled === undefined) {
          next.chattersCountEnabled = false;
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

    // ---------------- Kick channel management ----------------
    if (msg?.type === 'kick:channels:list') {
      try {
        const channels = await tracker.getKickChannels();
        sendResponse({ channels });
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }

    if (msg?.type === 'kick:channels:add') {
      try {
        const raw = Array.isArray(msg.slugs) ? msg.slugs : [];
        const normalized = Array.from(
          new Set(
            raw
              .map((s) => String(s).toLowerCase().trim())
              .filter(Boolean)
          )
        );
        const current = await tracker.getKickChannels();
        const actuallyNew = normalized.filter((s) => !current.includes(s));
        const next = await tracker.setKickChannels([...current, ...normalized]);

        // 新增 Kick 頻道：若通知設定尚不存在，預設開啟開台通知。
        if (actuallyNew.length > 0) {
          const notificationData = await tracker.read([STORAGE.notificationSettings]);
          const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
          const updatedNotificationSettings = { ...existingNotificationSettings };
          actuallyNew.forEach((slug) => {
            const key = `kick:${slug}`;
            if (updatedNotificationSettings[key] === undefined) {
              updatedNotificationSettings[key] = true;
            }
          });
          await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });
        }

        sendResponse({ ok: true, channels: next });
        await tracker.write({ [STORAGE.cachedAt]: 0 });
        setTimeout(() => {
          performPollAndBroadcast();
        }, 500);
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }

    if (msg?.type === 'kick:channels:remove') {
      try {
        const slug = String(msg.slug || '').toLowerCase().trim();
        if (!slug) {
          sendResponse({ error: 'Missing kick channel slug' });
          return;
        }

        const current = await tracker.getKickChannels();
        const next = current.filter((c) => c !== slug);
        await tracker.setKickChannels(next);

        // 移除 Kick 通知設定
        const notificationData = await tracker.read([STORAGE.notificationSettings]);
        const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
        const key = `kick:${slug}`;
        if (existingNotificationSettings[key] !== undefined) {
          delete existingNotificationSettings[key];
          await tracker.write({ [STORAGE.notificationSettings]: existingNotificationSettings });
        }

        // Optimistic UI update from cache.
        const cache = await tracker.read([STORAGE.cachedStreams]);
        const cachedPayload = Array.isArray(cache[STORAGE.cachedStreams]) ? cache[STORAGE.cachedStreams] : [];
        const filtered = cachedPayload.filter(
          (item) => !((item?.platform === 'kick') && String(item?.username || '').toLowerCase() === slug)
        );
        await tracker.write({ [STORAGE.cachedStreams]: filtered, [STORAGE.cachedAt]: Date.now() });
        try { chrome.runtime.sendMessage({ type: 'streams:update', payload: filtered }); } catch (_) {}

        sendResponse({ ok: true, channels: next });
        await tracker.write({ [STORAGE.cachedAt]: 0 });
        setTimeout(() => {
          performPollAndBroadcast();
        }, 500);
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }

    if (msg?.type === 'kick:channels:deleteAll') {
      try {
        await tracker.setKickChannels([]);

        // 移除所有 Kick 通知設定
        const notificationData = await tracker.read([STORAGE.notificationSettings]);
        const existingNotificationSettings = notificationData[STORAGE.notificationSettings] || {};
        const updatedNotificationSettings = { ...existingNotificationSettings };
        Object.keys(updatedNotificationSettings).forEach((k) => {
          if (String(k).startsWith('kick:')) delete updatedNotificationSettings[k];
        });
        await tracker.write({ [STORAGE.notificationSettings]: updatedNotificationSettings });

        const cache = await tracker.read([STORAGE.cachedStreams]);
        const cachedPayload = Array.isArray(cache[STORAGE.cachedStreams]) ? cache[STORAGE.cachedStreams] : [];
        const filtered = cachedPayload.filter((item) => item?.platform !== 'kick');
        await tracker.write({ [STORAGE.cachedStreams]: filtered, [STORAGE.cachedAt]: Date.now() });

        try { chrome.runtime.sendMessage({ type: 'streams:update', payload: filtered }); } catch (_) {}

        sendResponse({ ok: true, channels: [] });
        await tracker.write({ [STORAGE.cachedAt]: 0 });
        setTimeout(() => {
          performPollAndBroadcast();
        }, 500);
      } catch (e) {
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
      
      const kickData = await chrome.storage.local.get([STORAGE.kickChannels]);
      const kickSlugs = Array.isArray(kickData[STORAGE.kickChannels]) ? kickData[STORAGE.kickChannels] : [];
      const prevNotifData = await tracker.read([STORAGE.notificationSettings]);
      const prevNotif = prevNotifData[STORAGE.notificationSettings] || {};
      const kickNotificationSettings = {};
      kickSlugs.forEach((slug) => {
        const s = String(slug).toLowerCase();
        const key = `kick:${s}`;
        kickNotificationSettings[key] = prevNotif[key] !== undefined ? prevNotif[key] : true;
      });

      const kickOnlyPayload =
        kickSlugs.length > 0
          ? kickSlugs.map((slug) => ({
              username: slug,
              platform: 'kick',
              channel: undefined,
              displayName: slug,
              followedAt: null,
              lastStreamTime: null
            }))
          : [];

      await tracker.setChannels([]);
      await tracker.write({
        [STORAGE.notificationSettings]: kickNotificationSettings,
        [STORAGE.followDates]: {},
        [STORAGE.lastStreamTimes]: {},
        [STORAGE.cachedStreams]: kickOnlyPayload,
        [STORAGE.cachedAt]: Date.now()
      });
      try { await chrome.storage.local.set({ tsn_user_desc_cache: {} }); } catch (_) {}
      sendResponse({ ok: true, channels: [] });
      await tracker.updateBadge(0);
      try {
        chrome.runtime.sendMessage({ type: 'streams:update', payload: kickOnlyPayload });
      } catch (_) {}
      if (kickSlugs.length > 0) {
        setTimeout(() => {
          performPollAndBroadcast();
        }, 0);
      }
      return;
    }
    if (msg?.type === 'test:autoFollow') {
      try {
        console.log('Testing auto-follow functionality...');
        const accessToken = await tracker.ensureAccessToken({ interactive: true, source: 'manual' });
        if (!accessToken) {
          throw new Error('No access token available. Please authorize first.');
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
        const accessToken = await tracker.ensureAccessToken({ interactive: false });
        if (!accessToken) {
          throw new Error('Not authorized');
        }
        
        const userResponse = await fetch(`${TWITCH_API_BASE}/users`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID
          }
        });
        
        if (!userResponse.ok) {
          if (userResponse.status === 401) {
            await tracker.handleUnauthorizedToken('token_invalid');
          }
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
        const accessToken = await tracker.ensureAccessToken({ interactive: false });
        if (!accessToken) {
          throw new Error('Not authorized');
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
            if (resp.status === 401) {
              await tracker.handleUnauthorizedToken('token_invalid');
            }
            throw new Error(`users lookup failed: ${resp.status} ${t}`);
          }
          const data = await resp.json();
          const users = data?.data || [];
          users.forEach(u => {
            resultMap[String(u.login).toLowerCase()] = {
              id: u.id,
              login: u.login,
              display_name: u.display_name,
              description: u.description || '',
              profile_image_url: u.profile_image_url || ''
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
          STORAGE.kickChannels,
          STORAGE.notificationSettings,
          STORAGE.followDates
        ]);
        
        const localData = await chrome.storage.local.get(['tsn_favorites']);
        console.log('Favorites data from storage:', localData.tsn_favorites);
        
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
          kickChannels: allData[STORAGE.kickChannels] || [],
          notificationSettings: allData[STORAGE.notificationSettings] || {},
          followDates: allData[STORAGE.followDates] || {},
          tsn_favorites: localData.tsn_favorites || {}
        };
        
        console.log('Export data includes favorites:', exportData.tsn_favorites);
        
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

        if (importData.kickChannels) {
          importPromises.push(tracker.write({ [STORAGE.kickChannels]: importData.kickChannels }));
        }
        
        if (importData.notificationSettings) {
          importPromises.push(tracker.write({ [STORAGE.notificationSettings]: importData.notificationSettings }));
        }
        
        if (importData.followDates) {
          importPromises.push(tracker.write({ [STORAGE.followDates]: importData.followDates }));
        }
        
        if (importData.tsn_favorites) {
          importPromises.push(chrome.storage.local.set({ tsn_favorites: importData.tsn_favorites }));
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
    if (msg?.type === 'updateTranslationSettings') {
      try {
        await tracker.write({
          chatTranslationSettings: msg.settings
        });
        sendResponse({ ok: true });
      } catch (e) {
        console.error('Error updating translation settings:', e);
        sendResponse({ error: String(e?.message || e) });
      }
      return;
    }
    if (msg?.type === 'vods:get') {
      handleVodRequest(msg, sendResponse);
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


