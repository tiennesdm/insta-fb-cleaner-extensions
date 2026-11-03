const MODE_HINTS = {
  delete_chats:
    'Deletes entire chat threads one-by-one from your Instagram Direct Inbox (/direct/inbox/).',
  unsend_messages:
    'Unsends all messages sent by YOU inside the currently open chat so the other person cannot see them either.',
  unsend_then_delete:
    'Opens each chat, unsends your sent messages for everyone, and then deletes the chat thread from your inbox.'
};

const DEFAULT_SETTINGS = {
  mode: 'delete_chats',
  delayMs: 2200,
  maxItems: 0,
  skipUsernames: '',
  autoScroll: true,
  batchCooldown: true,
  batchSize: 20,
  cooldownSeconds: 25,
  includeRequestsAndGeneral: true,
  skipGroupChats: false
};

document.addEventListener('DOMContentLoaded', async () => {
  const modeSelect = document.getElementById('mode-select');
  const modeHint = document.getElementById('mode-hint');
  const delayInput = document.getElementById('delay-input');
  const maxInput = document.getElementById('max-input');
  const skipInput = document.getElementById('skip-input');
  const autoScrollCheck = document.getElementById('autoscroll-check');
  const cooldownCheck = document.getElementById('cooldown-check');
  const requestsCheck = document.getElementById('requests-check');
  const skipGroupsCheck = document.getElementById('skip-groups-check');

  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const openDmBtn = document.getElementById('open-dm-btn');
  const exportLogBtn = document.getElementById('export-log-btn');
  const resetStatsBtn = document.getElementById('reset-stats-btn');

  const statusBadge = document.getElementById('status-badge');
  const statDeleted = document.getElementById('stat-deleted');
  const statSkipped = document.getElementById('stat-skipped');
  const statErrors = document.getElementById('stat-errors');
  const currentActionEl = document.getElementById('current-action');
  const logList = document.getElementById('log-list');

  const confirmDialog = document.getElementById('confirm-dialog');

  let currentJobStatus = 'idle';

  function getFormSettings() {
    return {
      mode: modeSelect.value,
      delayMs: Math.max(800, Number(delayInput.value) || 2200),
      maxItems: Math.max(0, Number(maxInput.value) || 0),
      skipUsernames: skipInput.value.trim(),
      autoScroll: Boolean(autoScrollCheck.checked),
      batchCooldown: Boolean(cooldownCheck.checked),
      batchSize: 20,
      cooldownSeconds: 25,
      includeRequestsAndGeneral: Boolean(requestsCheck.checked),
      skipGroupChats: Boolean(skipGroupsCheck.checked)
    };
  }

  async function saveFormSettings() {
    const settings = getFormSettings();
    modeHint.textContent = MODE_HINTS[settings.mode] || MODE_HINTS.delete_chats;
    await chrome.storage.local.set({ settings });
    return settings;
  }

  function renderJobState(jobState) {
    if (!jobState) return;
    currentJobStatus = jobState.status || 'idle';
    const isRunning = currentJobStatus === 'running';
    const isPaused = currentJobStatus === 'paused';
    const isCooldown = currentJobStatus === 'cooldown';
    const isActive = isRunning || isPaused || isCooldown;

    if (isRunning) {
      statusBadge.textContent = 'Running';
      statusBadge.className = 'badge badge-running';
    } else if (isPaused || isCooldown) {
      statusBadge.textContent = isCooldown ? 'Cooldown' : 'Paused';
      statusBadge.className = 'badge badge-paused';
    } else {
      statusBadge.textContent = 'Idle';
      statusBadge.className = 'badge badge-idle';
    }

    statDeleted.textContent = String(jobState.deletedCount || 0);
    statSkipped.textContent = String(jobState.skippedCount || 0);
    statErrors.textContent = String(jobState.errorCount || 0);
    currentActionEl.textContent = jobState.currentAction || 'Ready to clean Instagram DMs.';

    startBtn.disabled = isActive;
    pauseBtn.disabled = !isActive;
    pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
    stopBtn.disabled = !isActive;

    const logs = Array.isArray(jobState.logs) ? jobState.logs : [];
    logList.textContent = '';
    if (logs.length === 0) {
      const li = document.createElement('li');
      li.className = 'log-empty';
      li.textContent = 'No activity yet.';
      logList.appendChild(li);
    } else {
      for (const item of logs.slice(0, 18)) {
        const li = document.createElement('li');
        li.textContent = item;
        logList.appendChild(li);
      }
    }
  }

  try {
    const { settings = DEFAULT_SETTINGS, jobState = {} } = await chrome.storage.local.get([
      'settings',
      'jobState'
    ]);
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    modeSelect.value = merged.mode;
    modeHint.textContent = MODE_HINTS[merged.mode] || MODE_HINTS.delete_chats;
    delayInput.value = String(merged.delayMs);
    maxInput.value = String(merged.maxItems);
    skipInput.value = merged.skipUsernames || '';
    autoScrollCheck.checked = merged.autoScroll !== false;
    cooldownCheck.checked = merged.batchCooldown !== false;
    requestsCheck.checked = merged.includeRequestsAndGeneral !== false;
    skipGroupsCheck.checked = Boolean(merged.skipGroupChats);

    renderJobState(jobState);
  } catch (err) {
    console.error('Failed to load popup state:', err);
  }

  modeSelect.addEventListener('change', saveFormSettings);
  delayInput.addEventListener('change', saveFormSettings);
  maxInput.addEventListener('change', saveFormSettings);
  skipInput.addEventListener('input', saveFormSettings);
  autoScrollCheck.addEventListener('change', saveFormSettings);
  cooldownCheck.addEventListener('change', saveFormSettings);
  requestsCheck.addEventListener('change', saveFormSettings);
  skipGroupsCheck.addEventListener('change', saveFormSettings);

  startBtn.addEventListener('click', async () => {
    await saveFormSettings();
    confirmDialog.showModal();
  });

  confirmDialog.addEventListener('close', async () => {
    const choice = confirmDialog.returnValue;
    confirmDialog.returnValue = '';
    if (choice !== 'delete') return;

    try {
      const settings = await saveFormSettings();
      await chrome.runtime.sendMessage({ type: 'START_JOB', settings });
    } catch (err) {
      currentActionEl.textContent = `Error: ${err?.message || 'Could not start job'}`;
    }
  });

  pauseBtn.addEventListener('click', async () => {
    try {
      if (currentJobStatus === 'paused') {
        await chrome.runtime.sendMessage({ type: 'RESUME_JOB' });
      } else {
        await chrome.runtime.sendMessage({ type: 'PAUSE_JOB' });
      }
    } catch (err) {
      console.error('Pause/Resume error:', err);
    }
  });

  stopBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_JOB' });
    } catch (err) {
      console.error('Stop error:', err);
    }
  });

  openDmBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'OPEN_INSTAGRAM_DM' });
    } catch (err) {
      console.error('Open Instagram DM error:', err);
    }
  });

  exportLogBtn.addEventListener('click', async () => {
    try {
      const { jobState = {}, settings = DEFAULT_SETTINGS } = await chrome.storage.local.get([
        'jobState',
        'settings'
      ]);
      const lines = [
        '=== InstaClean DM Deleter v2.0 — Backup & Activity Log ===',
        `Exported At: ${new Date().toLocaleString()}`,
        `Mode: ${settings.mode}`,
        `Total Deleted: ${jobState.deletedCount || 0}`,
        `Total Skipped: ${jobState.skippedCount || 0}`,
        `Total Errors: ${jobState.errorCount || 0}`,
        `Protected Usernames: ${settings.skipUsernames || '(none)'}`,
        '',
        '--- Deleted Items History ---'
      ];

      const history = Array.isArray(jobState.deletedHistory) ? jobState.deletedHistory : [];
      if (history.length === 0) {
        lines.push('No items deleted yet.');
      } else {
        for (const h of history) {
          lines.push(`[${h.time}] (${h.type}) ${h.title}`);
        }
      }

      lines.push('', '--- Recent Action Log ---');
      const logs = Array.isArray(jobState.logs) ? jobState.logs : [];
      for (const l of logs) {
        lines.push(l);
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `instaclean-backup-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export log error:', err);
    }
  });

  resetStatsBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
    } catch (err) {
      console.error('Reset stats error:', err);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.jobState?.newValue) {
      renderJobState(changes.jobState.newValue);
    }
    if (changes.settings?.newValue && document.activeElement !== skipInput) {
      skipInput.value = changes.settings.newValue.skipUsernames || '';
    }
  });
});
