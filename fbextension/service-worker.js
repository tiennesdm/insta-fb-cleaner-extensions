const DEFAULT_SETTINGS = {
  mode: 'delete_chats',
  delayMs: 1600,
  maxItems: 0,
  skipUsernames: '',
  autoScroll: true,
  batchCooldown: true,
  batchSize: 20,
  cooldownSeconds: 20
};

const DEFAULT_JOB_STATE = {
  status: 'idle',
  deletedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  currentAction: 'Ready to clean Facebook Messenger chats',
  logs: [],
  deletedHistory: []
};

async function updateBadgeFromState(jobState) {
  try {
    if (!jobState) return;
    if (jobState.status === 'running') {
      const countText = jobState.deletedCount > 0 ? String(jobState.deletedCount) : 'RUN';
      await chrome.action.setBadgeText({ text: countText });
      await chrome.action.setBadgeBackgroundColor({ color: '#0084FF' });
    } else if (jobState.status === 'paused' || jobState.status === 'cooldown') {
      await chrome.action.setBadgeText({ text: 'WAIT' });
      await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
    } else if (jobState.deletedCount > 0) {
      await chrome.action.setBadgeText({ text: String(jobState.deletedCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('Badge update failed:', err);
  }
}

async function ensureFacebookTab(navigateIfNeeded = true) {
  const tabs = await chrome.tabs.query({
    url: ['https://www.facebook.com/*', 'https://www.messenger.com/*']
  });
  let targetTab =
    tabs.find((t) => t.url && (t.url.includes('/messages') || t.url.includes('messenger.com'))) ||
    tabs[0];

  if (!targetTab) {
    if (!navigateIfNeeded) return null;
    targetTab = await chrome.tabs.create({
      url: 'https://www.facebook.com/messages/',
      active: true
    });
    return targetTab;
  }

  await chrome.tabs.update(targetTab.id, { active: true });
  if (targetTab.windowId) {
    await chrome.windows.update(targetTab.windowId, { focused: true });
  }

  if (
    navigateIfNeeded &&
    targetTab.url &&
    targetTab.url.includes('facebook.com') &&
    !targetTab.url.includes('/messages')
  ) {
    targetTab = await chrome.tabs.update(targetTab.id, {
      url: 'https://www.facebook.com/messages/'
    });
  }

  return targetTab;
}

async function ensureContentScriptReady(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_PING' });
    if (res && res.ready) return true;
  } catch (_) {
    // Content script not yet injected; inject programmatically
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });
    return true;
  } catch (err) {
    console.error('Failed to inject content script:', err);
    return false;
  }
}

async function broadcastToFacebookTabs(payload) {
  const tabs = await chrome.tabs.query({
    url: ['https://www.facebook.com/*', 'https://www.messenger.com/*']
  });
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, payload);
      } catch (_) {
        // Ignore tabs without content script loaded
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await chrome.storage.local.get(['settings', 'jobState']);
    const updates = {
      settings: { ...DEFAULT_SETTINGS, ...(existing.settings || {}) }
    };
    if (!existing.jobState) {
      updates.jobState = DEFAULT_JOB_STATE;
    } else if (
      existing.jobState.status === 'running' ||
      existing.jobState.status === 'paused' ||
      existing.jobState.status === 'cooldown'
    ) {
      updates.jobState = {
        ...DEFAULT_JOB_STATE,
        ...existing.jobState,
        status: 'idle',
        currentAction: 'Ready to clean Facebook Messenger chats'
      };
    }
    await chrome.storage.local.set(updates);
    await updateBadgeFromState(updates.jobState || existing.jobState);
  } catch (err) {
    console.error('Initialization error:', err);
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.jobState?.newValue) {
    await updateBadgeFromState(changes.jobState.newValue);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'START_JOB') {
        const { settings = DEFAULT_SETTINGS, jobState = DEFAULT_JOB_STATE } =
          await chrome.storage.local.get(['settings', 'jobState']);

        const mergedSettings = { ...DEFAULT_SETTINGS, ...settings, ...(message.settings || {}) };
        await chrome.storage.local.set({ settings: mergedSettings });

        const tab = await ensureFacebookTab(true);
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: 'Could not open Facebook tab.' });
          return;
        }

        const ready = await ensureContentScriptReady(tab.id);
        if (!ready) {
          const nextState = {
            ...DEFAULT_JOB_STATE,
            ...jobState,
            status: 'running',
            currentAction: 'Opening Facebook Messages... Deletion will start automatically.'
          };
          await chrome.storage.local.set({ jobState: nextState, pendingAutoStart: true });
          sendResponse({ ok: true, pendingNavigation: true });
          return;
        }

        await chrome.storage.local.set({ pendingAutoStart: false });
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'CONTENT_START_JOB',
          settings: mergedSettings
        });
        sendResponse(response || { ok: true });
        return;
      }

      if (message.type === 'PAUSE_JOB') {
        await broadcastToFacebookTabs({ type: 'CONTENT_PAUSE_JOB' });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'RESUME_JOB') {
        await broadcastToFacebookTabs({ type: 'CONTENT_RESUME_JOB' });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'STOP_JOB') {
        const { jobState = DEFAULT_JOB_STATE } = await chrome.storage.local.get('jobState');
        const updatedState = {
          ...DEFAULT_JOB_STATE,
          ...jobState,
          status: 'idle',
          currentAction: 'Stopped by user.'
        };
        await chrome.storage.local.set({
          jobState: updatedState,
          pendingAutoStart: false
        });
        await broadcastToFacebookTabs({ type: 'CONTENT_STOP_JOB' });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'OPEN_FB_DM') {
        const tab = await ensureFacebookTab(true);
        sendResponse({ ok: Boolean(tab) });
        return;
      }

      if (message.type === 'RESET_STATS') {
        await chrome.storage.local.set({
          jobState: DEFAULT_JOB_STATE,
          pendingAutoStart: false
        });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'CONTENT_READY') {
        const { pendingAutoStart = false, settings = DEFAULT_SETTINGS } =
          await chrome.storage.local.get(['pendingAutoStart', 'settings']);
        if (pendingAutoStart && sender.tab?.id) {
          await chrome.storage.local.set({ pendingAutoStart: false });
          await chrome.tabs.sendMessage(sender.tab.id, {
            type: 'CONTENT_START_JOB',
            settings
          });
        }
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      console.error('Service worker message error:', err);
      sendResponse({ ok: false, error: err?.message || 'Unexpected error' });
    }
  })();
  return true;
});
