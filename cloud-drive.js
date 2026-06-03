/**
 * Google Drive backup (appDataFolder, Tampermonkey-style). Loaded via importScripts in background.js.
 */
'use strict';

const DRIVE_APPDATA_PARENT = 'appDataFolder';
const BACKUP_NAME_PREFIX = 'twitch-live-notifier-backup';
const MAX_DRIVE_BACKUPS = 30;
const OAUTH_PLACEHOLDER = 'YOUR_CLIENT_ID';

function tsnI18n(key, substitutions) {
  try {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  } catch (_) {
    return key;
  }
}

function isOAuthConfigured() {
  try {
    const oauth2 = chrome.runtime.getManifest()?.oauth2;
    const id = String(oauth2?.client_id || '').trim();
    if (!id || id.includes(OAUTH_PLACEHOLDER)) return false;
    return id.endsWith('.apps.googleusercontent.com');
  } catch (_) {
    return false;
  }
}

function oauthNotConfiguredError() {
  return new Error(tsnI18n('driveNotConfigured'));
}

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    if (!isOAuthConfigured()) {
      reject(oauthNotConfiguredError());
      return;
    }
    chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || String(err)));
        return;
      }
      if (!token) {
        reject(new Error(tsnI18n('driveAuthTokenFailed')));
        return;
      }
      resolve(token);
    });
  });
}

async function driveApiFetch(path, options = {}) {
  const token = await getAuthToken(options.interactive !== false);
  const url = path.startsWith('http') ? path : `https://www.googleapis.com/drive/v3${path}`;
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return res;
}

function defaultBackupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${BACKUP_NAME_PREFIX}-${stamp}.json`;
}

async function getGoogleUserEmail() {
  try {
    const token = await getAuthToken(false);
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.email || null;
  } catch (_) {
    return null;
  }
}

async function getCloudDriveAuthStatus() {
  if (!isOAuthConfigured()) {
    return { configured: false, signedIn: false, email: null };
  }
  try {
    await getAuthToken(false);
    const email = await getGoogleUserEmail();
    return { configured: true, signedIn: true, email };
  } catch (_) {
    return { configured: true, signedIn: false, email: null };
  }
}

async function uploadTsnDriveBackup(json, fileName) {
  const name = String(fileName || '').trim() || defaultBackupFileName();
  const bodyText = String(json || '');
  if (!bodyText) throw new Error(tsnI18n('driveBackupEmpty'));

  const token = await getAuthToken(true);
  const boundary = `tsnbackup${Date.now()}`;
  const meta = JSON.stringify({
    name,
    mimeType: 'application/json',
    parents: [DRIVE_APPDATA_PARENT]
  });
  const multipart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    meta +
    '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    bodyText +
    `\r\n--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipart
    }
  );

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message || detail;
    } catch (_) {}
    throw new Error(detail);
  }

  const file = await res.json();
  await pruneTsnDriveBackups(MAX_DRIVE_BACKUPS);
  return file;
}

async function listTsnDriveBackupsInSpace(space, extraQuery = '') {
  const q = [
    `name contains '${BACKUP_NAME_PREFIX}'`,
    "mimeType='application/json'",
    'trashed=false',
    extraQuery
  ]
    .filter(Boolean)
    .join(' and ');
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
    spaces: space
  });
  const res = await driveApiFetch(`/files?${params}`, { interactive: false });
  const data = await res.json();
  return Array.isArray(data?.files) ? data.files : [];
}

async function listTsnDriveBackups() {
  const appdata = await listTsnDriveBackupsInSpace('appDataFolder');

  let legacyRoot = [];
  try {
    legacyRoot = await listTsnDriveBackupsInSpace('drive', "'root' in parents");
  } catch (_) {
    // drive.appdata 無法存取 spaces=drive；略過舊版根目錄備份即可
  }

  const byId = new Map();
  for (const f of [...appdata, ...legacyRoot]) {
    if (f?.id) byId.set(f.id, f);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)
  );
}

async function pruneTsnDriveBackups(maxCount = MAX_DRIVE_BACKUPS) {
  const files = await listTsnDriveBackups();
  if (files.length <= maxCount) return;
  const toRemove = files.slice(maxCount);
  for (const f of toRemove) {
    if (f?.id) {
      await deleteTsnDriveBackup(f.id);
    }
  }
}

async function downloadTsnDriveBackup(fileId) {
  const id = String(fileId || '').trim();
  if (!id) throw new Error(tsnI18n('driveMissingFileId'));
  const res = await driveApiFetch(`/files/${encodeURIComponent(id)}?alt=media`, {
    interactive: false
  });
  return res.text();
}

async function deleteTsnDriveBackup(fileId) {
  const id = String(fileId || '').trim();
  if (!id) throw new Error(tsnI18n('driveMissingFileId'));
  await driveApiFetch(`/files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    interactive: false
  });
}

async function signInGoogleDrive() {
  await getAuthToken(true);
  return getCloudDriveAuthStatus();
}

async function revokeGoogleDriveAccess() {
  if (!isOAuthConfigured()) return;

  const token = await new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (t) => resolve(t || null));
  });

  if (token) {
    try {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`);
    } catch (_) {}
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }

  await new Promise((resolve) => {
    chrome.identity.clearAllCachedAuthTokens(() => resolve());
  });
}
