# 📺 Twitch Live Notifier

Notify you when selected Twitch streamers go live, and show live stream information in the popup.

## ✨ Features

- 🚀 Real-time notifications when your tracked streamers go live
- 🗂️ Popup overview with title, category, viewer count, and live duration
- 🔄 Background scheduler with customizable check interval (default 1 minute)
- 👥 Track and manage multiple streamers at once
- 🔐 Official Twitch OAuth flow (no manual credentials required)
- 🌍 Localization: zh-TW, zh-CN, en, ja, ko
- 💾 Settings backup (export/import)

## 🚀 Install & Use

1) Open `chrome://extensions`, enable Developer mode, click “Load unpacked”, and select this folder.
2) Click the extension icon → go to the Settings tab → Authorize your Twitch account.
3) Add channels manually or enable auto-sync of your followed channels.
4) Check the Streams tab or wait for notifications to view live info.

## ⚙️ Settings

- Mute notifications, hide offline streamers, hide previews
- Check interval (minutes)
- Per-channel notification selection (in auto-sync mode)
- Backup: export/import settings

## 🔒 Permissions & Privacy

- Permissions: `storage`, `notifications`, `alarms`, `activeTab`, `tabs`
- Hosts: `https://api.twitch.tv/*`, `https://id.twitch.tv/*`, `https://static-cdn.jtvnw.net/*`
- Privacy: all settings and channel lists are stored locally. The extension only requests public data from Twitch’s official API. No personal data collection or upload.

## 🧰 Development

- Manifest V3 with background service worker
- Main files: `popup.html` / `popup.js`, `background.js`
- I18n files: `_locales/*/messages.json`
- Auth success page: `authorization-success.html` (localized at runtime)

## ❓ FAQ

- No notification? Ensure system notifications are allowed, “Mute notifications” is off, and channels are added.
- Auto-sync not working? After authorization, enable “Auto Tracking” in Settings.
- Data not refreshing? Shorten the check interval or refresh manually.

## 📄 License

MIT License
