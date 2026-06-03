'use strict';

(function initDriveBackupUi() {
  const ui = {
    signinBlock: document.getElementById('driveSigninBlock'),
    mainBlock: document.getElementById('driveMainBlock'),
    status: document.getElementById('driveStatusText'),
    account: document.getElementById('driveAccountText'),
    lastBackupHint: document.getElementById('driveLastBackupHint'),
    connect: document.getElementById('driveConnectBtn'),
    disconnect: document.getElementById('driveDisconnectBtn'),
    upload: document.getElementById('driveUploadBtn'),
    refresh: document.getElementById('driveRefreshListBtn'),
    openList: document.getElementById('driveOpenListBtn'),
    openListLabel: document.getElementById('driveOpenListBtnLabel')
  };

  if (!ui.status) return;

  let backups = [];
  let auth = { configured: false, signedIn: false, email: null };
  let lastBackup = null;
  let modalOverlay = null;
  let confirmOverlay = null;

  function i18n(key, ...substitutions) {
    try {
      return chrome.i18n.getMessage(key, substitutions) || key;
    } catch (_) {
      return key;
    }
  }

  function driveMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res || res.ok === false) {
          reject(new Error(res?.error || 'Request failed'));
          return;
        }
        resolve(res);
      });
    });
  }

  function formatDriveTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return String(iso);
    }
  }

  function formatSize(bytes) {
    const n = Number(bytes);
    if (!n || Number.isNaN(n)) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function isSignedIn() {
    return !!(auth.configured && auth.signedIn);
  }

  function getLastBackupDisplayTime() {
    if (backups.length > 0) {
      const newest = backups[0];
      if (newest?.modifiedTime) return newest.modifiedTime;
    }
    return lastBackup?.time || lastBackup?.modifiedTime || null;
  }

  function updateOpenListButton() {
    if (!ui.openList || !ui.openListLabel) return;
    const n = backups.length;
    ui.openListLabel.textContent =
      n > 0 ? i18n('driveOpenBackupListCount', [String(n)]) : i18n('driveOpenBackupList');
  }

  function updateLayout() {
    const signedIn = isSignedIn();

    if (ui.signinBlock) {
      ui.signinBlock.style.display = signedIn ? 'none' : 'block';
    }
    if (ui.mainBlock) {
      ui.mainBlock.style.display = signedIn ? 'flex' : 'none';
    }

    if (signedIn && ui.account) {
      ui.account.textContent = auth.email || i18n('driveConnectedUnknown');
      ui.account.title = ui.account.textContent;
    }

    if (ui.lastBackupHint) {
      if (!signedIn) {
        ui.lastBackupHint.style.display = 'none';
        ui.lastBackupHint.textContent = '';
      } else {
        const displayTime = getLastBackupDisplayTime();
        if (displayTime) {
          ui.lastBackupHint.textContent = i18n('driveLastBackup', [formatDriveTime(displayTime)]);
          ui.lastBackupHint.style.display = 'block';
        } else {
          ui.lastBackupHint.textContent = i18n('driveNeverBackedUp');
          ui.lastBackupHint.style.display = 'block';
        }
      }
    }

    updateOpenListButton();
    updateButtons();
  }

  function updateButtons() {
    const signedIn = isSignedIn();
    const actionDisabled = !signedIn;
    if (ui.upload) ui.upload.disabled = actionDisabled;
    if (ui.refresh) ui.refresh.disabled = actionDisabled;
    if (ui.openList) ui.openList.disabled = actionDisabled;
  }

  function renderStatus() {
    if (!ui.status) {
      updateLayout();
      return;
    }
    if (!auth.configured) {
      ui.status.textContent = i18n('driveNotConfigured');
      updateLayout();
      return;
    }
    if (!auth.signedIn) {
      ui.status.textContent = i18n('driveNotConnected');
      updateLayout();
      return;
    }
    updateLayout();
  }

  function closeDriveModal() {
    closeDriveConfirm();
    if (modalOverlay) {
      modalOverlay.remove();
      modalOverlay = null;
    }
    document.removeEventListener('keydown', onModalEsc);
  }

  function onModalEsc(e) {
    if (e.key !== 'Escape') return;
    if (confirmOverlay) {
      closeDriveConfirm();
      return;
    }
    closeDriveModal();
  }

  function closeDriveConfirm() {
    if (confirmOverlay) {
      confirmOverlay.remove();
      confirmOverlay = null;
    }
  }

  function confirmAction(message, title, onConfirm, okLabel) {
    closeDriveConfirm();

    const overlay = document.createElement('div');
    overlay.className = 'drive-confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'drive-confirm-dialog';

    const titleEl = document.createElement('h3');
    titleEl.className = 'drive-confirm-dialog__title';
    titleEl.textContent = title || '';

    const messageEl = document.createElement('p');
    messageEl.className = 'drive-confirm-dialog__message';
    messageEl.textContent = String(message || '').replace(/<br\s*\/?>/gi, '\n');

    const actions = document.createElement('div');
    actions.className = 'drive-confirm-dialog__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'drive-confirm-dialog__btn drive-confirm-dialog__btn--cancel';
    cancelBtn.textContent = i18n('cancel');

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'drive-confirm-dialog__btn drive-confirm-dialog__btn--ok';
    okBtn.textContent = okLabel || i18n('driveRestoreSelected');

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    const cleanup = () => closeDriveConfirm();

    cancelBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });
    okBtn.addEventListener('click', () => {
      cleanup();
      onConfirm();
    });

    confirmOverlay = overlay;
    document.body.appendChild(overlay);
    cancelBtn.focus();
  }

  async function restoreBackup(fileId) {
    try {
      await driveMessage('cloudDrive:restore', { fileId });
      closeDriveModal();
      if (typeof loadSettings === 'function') {
        loadSettings();
      }
      if (typeof refresh === 'function') {
        setTimeout(() => refresh(), 100);
      }
    } catch (_) {}
  }

  async function deleteBackup(file) {
    try {
      await driveMessage('cloudDrive:delete', { fileId: file.id });
      await refreshList();
      const listEl = modalOverlay?.querySelector('.drive-modal__body');
      if (listEl) {
        renderModalList(listEl, () => openDriveBackupModal());
      }
    } catch (_) {}
  }

  function renderModalList(listEl, onReload) {
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!backups.length) {
      const empty = document.createElement('p');
      empty.className = 'drive-modal__empty';
      empty.textContent = i18n('driveBackupListEmpty');
      listEl.appendChild(empty);
      return;
    }

    backups.forEach((file) => {
      const li = document.createElement('div');
      li.className = 'drive-modal__item';

      const nameEl = document.createElement('div');
      nameEl.className = 'drive-modal__name';
      nameEl.textContent = file.name || 'backup.json';
      nameEl.title = file.name || '';

      const metaEl = document.createElement('div');
      metaEl.className = 'drive-modal__meta';
      const parts = [];
      const time = formatDriveTime(file.modifiedTime);
      if (time) parts.push(time);
      const size = formatSize(file.size);
      if (size) parts.push(i18n('driveBackupItemMeta', [size]));
      metaEl.textContent = parts.join(' · ');

      const actions = document.createElement('div');
      actions.className = 'drive-modal__actions';

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'drive-modal__btn drive-modal__btn--restore';
      restoreBtn.textContent = i18n('driveRestoreSelected');
      restoreBtn.onclick = () => {
        confirmAction(
          i18n('driveRestoreConfirm'),
          i18n('driveRestoreConfirmTitle'),
          () => restoreBackup(file.id),
          i18n('driveRestoreSelected')
        );
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'drive-modal__btn drive-modal__btn--delete';
      deleteBtn.textContent = i18n('driveDeleteSelected');
      deleteBtn.onclick = () => {
        const fileName = file.name || 'backup.json';
        confirmAction(
          i18n('driveDeleteConfirm'),
          i18n('driveDeleteConfirmTitle'),
          () => deleteBackup(file),
          i18n('driveDeleteSelected')
        );
      };

      actions.appendChild(restoreBtn);
      actions.appendChild(deleteBtn);
      li.appendChild(nameEl);
      li.appendChild(metaEl);
      li.appendChild(actions);
      listEl.appendChild(li);
    });
  }

  async function openDriveBackupModal() {
    if (!isSignedIn()) return;

    closeDriveModal();

    const overlay = document.createElement('div');
    overlay.className = 'drive-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'drive-modal';

    const head = document.createElement('div');
    head.className = 'drive-modal__head';

    const title = document.createElement('h3');
    title.className = 'drive-modal__title';
    title.textContent = i18n('driveModalTitle');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'drive-modal__close';
    closeBtn.setAttribute('aria-label', i18n('driveModalClose'));
    closeBtn.textContent = '×';
    closeBtn.onclick = closeDriveModal;

    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'drive-modal__body';
    body.textContent = i18n('driveModalLoading');

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDriveModal();
    });

    document.body.appendChild(overlay);
    modalOverlay = overlay;
    document.addEventListener('keydown', onModalEsc);

    const reload = async () => {
      body.textContent = i18n('driveModalLoading');
      try {
        await refreshList();
        renderModalList(body, reload);
      } catch (e) {
        body.innerHTML = '';
        const err = document.createElement('p');
        err.className = 'drive-modal__empty';
        err.textContent = String(e.message || e);
        body.appendChild(err);
      }
    };

    await reload();
  }

  async function refreshAuth() {
    const res = await driveMessage('cloudDrive:authStatus');
    auth = res.status || { configured: false, signedIn: false, email: null };
    lastBackup = res.lastBackup || null;
    renderStatus();
  }

  async function refreshList() {
    if (!isSignedIn()) {
      backups = [];
      updateOpenListButton();
      return;
    }
    const res = await driveMessage('cloudDrive:list');
    backups = Array.isArray(res.files) ? res.files : [];
    updateOpenListButton();
    updateLayout();

    if (modalOverlay) {
      const listEl = modalOverlay.querySelector('.drive-modal__body');
      if (listEl) {
        renderModalList(listEl, () => openDriveBackupModal());
      }
    }
  }

  async function bootstrap() {
    ui.status.textContent = i18n('driveBackupLoading');
    try {
      await refreshAuth();
      if (isSignedIn()) {
        await refreshList();
      } else {
        backups = [];
        updateOpenListButton();
      }
    } catch (e) {
      ui.status.textContent = String(e.message || e);
    }
  }

  ui.connect?.addEventListener('click', async () => {
    try {
      const res = await driveMessage('cloudDrive:signIn');
      auth = res.status || auth;
      await refreshAuth();
      await refreshList();
    } catch (_) {}
  });

  ui.disconnect?.addEventListener('click', async () => {
    try {
      await driveMessage('cloudDrive:revoke');
      closeDriveModal();
      auth = { configured: auth.configured, signedIn: false, email: null };
      backups = [];
      lastBackup = null;
      renderStatus();
    } catch (_) {}
  });

  ui.upload?.addEventListener('click', async () => {
    try {
      if (ui.upload) ui.upload.disabled = true;
      const res = await driveMessage('cloudDrive:upload');
      lastBackup = res.lastBackup || lastBackup;
      await refreshList();
      renderStatus();
    } catch (_) {}
    finally {
      updateButtons();
    }
  });

  ui.refresh?.addEventListener('click', async () => {
    try {
      if (ui.refresh) ui.refresh.disabled = true;
      await refreshList();
    } catch (_) {}
    finally {
      updateButtons();
    }
  });

  ui.openList?.addEventListener('click', () => {
    openDriveBackupModal();
  });

  window.refreshDriveBackupI18n = function refreshDriveBackupI18n() {
    renderStatus();
    updateLayout();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
