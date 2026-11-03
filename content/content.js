(() => {
  if (window.__instacleanContentLoaded) return;
  window.__instacleanContentLoaded = true;

  // Seamless fallback if injected directly into browser tab outside extension context
  if (!globalThis.chrome?.storage?.local) {
    const listeners = [];
    const readStore = () => {
      try {
        return JSON.parse(localStorage.getItem('__instaclean_store__') || '{}');
      } catch (_) {
        return {};
      }
    };
    const writeStore = (obj) => {
      try {
        localStorage.setItem('__instaclean_store__', JSON.stringify(obj));
      } catch (_) {
        // Ignore quota errors
      }
    };
    globalThis.chrome = globalThis.chrome || {};
    globalThis.chrome.storage = {
      local: {
        async get(keys) {
          const all = readStore();
          if (!keys) return all;
          const keyList = Array.isArray(keys)
            ? keys
            : typeof keys === 'string'
              ? [keys]
              : Object.keys(keys);
          const out = {};
          for (const k of keyList) {
            out[k] =
              all[k] !== undefined
                ? all[k]
                : typeof keys === 'object' && !Array.isArray(keys)
                  ? keys[k]
                  : undefined;
          }
          return out;
        },
        async set(updates) {
          const all = readStore();
          const changes = {};
          for (const [k, v] of Object.entries(updates || {})) {
            changes[k] = { oldValue: all[k], newValue: v };
            all[k] = v;
          }
          writeStore(all);
          listeners.forEach((fn) => fn(changes, 'local'));
        }
      },
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        }
      }
    };
    globalThis.chrome.runtime = globalThis.chrome.runtime || {
      onMessage: { addListener() {} },
      async sendMessage() {
        return { ok: true };
      }
    };
  }

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

  let isRunning = false;
  let isPaused = false;
  let stopRequested = false;
  let currentSettings = { ...DEFAULT_SETTINGS };
  window.__instacleanStopOldInstance = () => {
    stopRequested = true;
    isRunning = false;
  };

  // Only store skipped/protected/un-deletable threads so deleted chats with duplicate names (e.g. "Instagram user") never block others
  const skippedThreadKeys = new Set();
  const processedMessageEls = new WeakSet();
  const visitedInboxTabs = new Set();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function randomJitter(baseMs) {
    const jitter = Math.floor(Math.random() * 400) + 100;
    return Math.max(800, Number(baseMs || 2000) + jitter);
  }

  // Background-safe DOM batch highlighting (never stalls when tab is hidden or occluded)
  async function highlightElementsBatch(elements, highlight = true) {
    const list = Array.from(elements || []).filter(Boolean);
    for (const el of list) {
      el.classList.toggle('instaclean-target-highlight', highlight);
    }
  }

  async function updateJobState(partial) {
    try {
      const { jobState = {} } = await chrome.storage.local.get('jobState');
      const logs = Array.isArray(jobState.logs) ? [...jobState.logs] : [];
      const deletedHistory = Array.isArray(jobState.deletedHistory)
        ? [...jobState.deletedHistory]
        : [];

      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      if (partial.logEntry) {
        logs.unshift(`[${timeStr}] ${partial.logEntry}`);
        if (logs.length > 60) logs.length = 60;
      }

      if (partial.historyItem) {
        deletedHistory.unshift({
          time: new Date().toISOString(),
          ...partial.historyItem
        });
        if (deletedHistory.length > 500) deletedHistory.length = 500;
      }

      const { logEntry, historyItem, ...rest } = partial;
      const defaultStatus = !isRunning ? 'idle' : isPaused ? 'paused' : 'running';

      const next = {
        status: defaultStatus,
        deletedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        currentAction: 'Ready',
        ...jobState,
        ...rest,
        logs,
        deletedHistory
      };
      await chrome.storage.local.set({ jobState: next });
      renderFloatingWidgetState(next);
      return next;
    } catch (err) {
      console.warn('InstaClean storage update error:', err);
      return null;
    }
  }

  async function waitWhilePaused() {
    while (isPaused && !stopRequested) {
      await sleep(300);
    }
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  }

  // Click helper with custom horizontal offset ratio (default 0.5, or 0.58 for thread rows to avoid left Story avatars)
  function simulateClick(el, xRatio = 0.5) {
    if (!el) return false;
    const target =
      el.closest(
        'button, [role="button"], a, [role="menuitem"], [role="option"], [role="tab"], [tabindex="0"]'
      ) || el;

    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width * xRatio;
    const clientY = rect.top + rect.height / 2;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1
    };

    target.dispatchEvent(new PointerEvent('pointerover', eventInit));
    target.dispatchEvent(new MouseEvent('mouseover', eventInit));
    target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    target.dispatchEvent(new MouseEvent('mousedown', eventInit));
    target.dispatchEvent(new PointerEvent('pointerup', eventInit));
    target.dispatchEvent(new MouseEvent('mouseup', eventInit));
    target.dispatchEvent(new MouseEvent('click', eventInit));
    if (typeof target.click === 'function') {
      target.click();
    }
    return true;
  }

  function simulateHover(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY
    };
    let node = el;
    for (let depth = 0; depth < 5 && node && node !== document.body; depth++) {
      node.dispatchEvent(new PointerEvent('pointerenter', init));
      node.dispatchEvent(new MouseEvent('mouseenter', init));
      node.dispatchEvent(new PointerEvent('pointerover', init));
      node.dispatchEvent(new MouseEvent('mouseover', init));
      node.dispatchEvent(new PointerEvent('pointermove', init));
      node.dispatchEvent(new MouseEvent('mousemove', init));
      node = node.parentElement;
    }
  }

  function findClickableByText(patterns, root = document) {
    const regexes = patterns.map((p) => (p instanceof RegExp ? p : new RegExp(`^${p}$`, 'i')));
    const candidates = root.querySelectorAll(
      'button, [role="button"], [role="menuitem"], [role="tab"], a, span, div'
    );
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      if (el.closest('#instaclean-floating-root') || el.classList.contains('instaclean-row-toggle')) {
        continue;
      }
      const text = (el.textContent || '').trim();
      if (!text || text.length > 65) continue;

      if (regexes.some((rx) => rx.test(text))) {
        const clickable =
          el.closest(
            'button, [role="button"], [role="menuitem"], [role="tab"], a, [tabindex="0"]'
          ) || el;
        if (isVisible(clickable)) {
          return clickable;
        }
      }
    }
    return null;
  }

  async function waitForElement(finderFn, timeoutMs = 2600, intervalMs = 180) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !stopRequested) {
      const found = finderFn();
      if (found) return found;
      await sleep(intervalMs);
    }
    return null;
  }

  function parseSkipList(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
  }

  function detectRateLimitModal() {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const text = (dialog.innerText || dialog.textContent || '').trim();
      if (
        /try again later|action blocked|restrict certain activity|wait a few minutes|कोशिश बाद में करें/i.test(
          text
        )
      ) {
        const okBtn = findClickableByText([/^(ok|okay|close|dismiss|ठीक है)$/i], dialog);
        return { detected: true, dismissBtn: okBtn };
      }
    }
    return { detected: false, dismissBtn: null };
  }

  async function runCooldownCountdown(seconds, reasonLabel) {
    for (let rem = seconds; rem > 0 && !stopRequested; rem--) {
      await waitWhilePaused();
      await updateJobState({
        status: 'cooldown',
        currentAction: `⏳ ${reasonLabel} — Resuming in ${rem}s...`
      });
      await sleep(1000);
    }
    if (!stopRequested) {
      await updateJobState({
        status: isPaused ? 'paused' : 'running',
        currentAction: 'Resuming cleanup...'
      });
    }
  }

  // Locate the scrollable Left Inbox Sidebar container
  function findInboxScrollContainer() {
    const allDivs = document.querySelectorAll('div');
    let best = null;
    for (const div of allDivs) {
      const rect = div.getBoundingClientRect();
      if (rect.left >= 0 && rect.left < 220 && rect.width > 240 && rect.width < 520 && rect.height > 200) {
        const style = window.getComputedStyle(div);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          div.scrollHeight > div.clientHeight + 5
        ) {
          if (!best || div.scrollHeight > best.scrollHeight) {
            best = div;
          }
        }
      }
    }
    return best;
  }

  // Extract a stable key & title from an inbox thread element
  function getThreadIdentity(threadEl) {
    if (!threadEl) return { key: '', title: 'Chat', isGroup: false };
    const link =
      threadEl.tagName === 'A' ? threadEl : threadEl.querySelector('a[href*="/direct/t/"]');
    const href = link ? link.getAttribute('href') || '' : '';

    // Use innerText on attached element so flex/block lines stay separated with \n
    const lines = (threadEl.innerText || threadEl.textContent || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.includes('🛡️') && !s.includes('🗑️'));

    const title = lines[0] || 'Chat';
    const normTitle = title.toLowerCase();
    // Avoid volatile "Active Xm ago" timestamps in key unless generic "instagram user"
    const key =
      href ||
      (normTitle === 'instagram user'
        ? `thread:${normTitle}|${(lines[1] || '').toLowerCase()}`
        : `thread:${normTitle}`);
    const avatars = threadEl.querySelectorAll('img');
    const isGroup = avatars.length > 1 || (title.includes(',') && title.length > 15);

    return { key, title, isGroup };
  }

  // Locate Instagram DM thread items strictly inside the visible inbox list viewport
  function findInboxThreadItems() {
    const ignoredTexts =
      /^(primary|general|requests|hidden requests|notes|your note|search|messages|new message|प्राइमरी|जनरल|अनुरोध|नोट्स|खोजें)$/i;

    const scroller = findInboxScrollContainer();
    const scrollerRect = scroller
      ? scroller.getBoundingClientRect()
      : { top: 200, bottom: window.innerHeight, left: 0, right: 480 };

    const minTop = Math.max(120, scrollerRect.top - 8);
    const maxBottom = Math.min(window.innerHeight - 4, scrollerRect.bottom + 8);

    const searchRoot = scroller || document;
    const results = [];
    const seen = new Set();

    const addCandidate = (el) => {
      if (!el || seen.has(el) || !isVisible(el)) return;
      if (el.closest('#instaclean-floating-root, nav, header, [role="tablist"], [role="dialog"]')) {
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.left > 480) return;
      if (rect.width < 180 || rect.height < 48 || rect.height > 125) return;

      // Center of the row must be inside the visible scroll viewport (not hidden behind Notes/Search header)
      const centerY = rect.top + rect.height / 2;
      if (centerY < minTop + 12 || centerY > maxBottom - 12) return;

      // Exclude horizontal Notes strip
      const scrollParent = el.parentElement;
      if (
        scrollParent &&
        scrollParent.scrollWidth > scrollParent.clientWidth + 40 &&
        scrollParent.clientHeight < 150
      ) {
        return;
      }

      const clone = el.cloneNode(true);
      clone.querySelectorAll('.instaclean-row-toggle').forEach((n) => n.remove());
      const text = (clone.innerText || clone.textContent || '').trim();
      if (!text || ignoredTexts.test(text)) return;

      for (const existing of results) {
        const er = existing.getBoundingClientRect();
        if (Math.abs(er.top - rect.top) < 24) {
          return;
        }
      }

      seen.add(el);
      results.push(el);
    };

    // Primary strategy: div[role="button"][tabindex="0"] rows inside the inbox scroller
    const buttons = searchRoot.querySelectorAll(
      'div[role="button"][tabindex="0"], a[href*="/direct/t/"], [role="listitem"] [role="button"], [role="row"] [role="button"]'
    );
    for (const btn of buttons) {
      addCandidate(btn);
    }

    results.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return results;
  }

  // Scroll the left inbox list down (or reset to top if at bottom) and dispatch scroll events
  async function scrollInboxList(scroller, direction = 'down') {
    if (!scroller) return false;
    const before = scroller.scrollTop;
    if (direction === 'top') {
      scroller.scrollTop = 0;
    } else if (direction === 'bottom') {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      scroller.scrollTop = before + 550;
    }
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    scroller.dispatchEvent(
      new WheelEvent('wheel', { deltaY: direction === 'top' ? -800 : 600, bubbles: true })
    );
    await sleep(1300);
    return Math.abs(scroller.scrollTop - before) > 2;
  }

  // Trigger Instagram's bottom IntersectionObserver sentinel so it loads the next page of conversations
  async function triggerInboxPaginationLoad() {
    const scroller = findInboxScrollContainer();
    if (!scroller) return;
    const prevTop = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 700, bubbles: true }));
    await sleep(900);
    if (prevTop < scroller.scrollTop - 600) {
      scroller.scrollTop = prevTop + 300;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(500);
    }
  }

  async function toggleKeepConversationName(rawName, forceKeep = null) {
    const norm = (rawName || '').toLowerCase().replace(/^@/, '').trim();
    if (!norm) return;
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
    const list = parseSkipList(settings.skipUsernames);
    const idx = list.findIndex((u) => norm.includes(u) || u.includes(norm));

    if (forceKeep === true) {
      if (idx === -1) list.push(norm);
    } else if (forceKeep === false) {
      if (idx >= 0) list.splice(idx, 1);
    } else {
      if (idx >= 0) list.splice(idx, 1);
      else list.push(norm);
    }

    const updatedSkip = list.join(', ');
    const nextSettings = { ...DEFAULT_SETTINGS, ...settings, skipUsernames: updatedSkip };
    currentSettings = nextSettings;
    await chrome.storage.local.set({ settings: nextSettings });
    syncRowProtectionToggles();
  }

  function renderKeepChecklistInWidget() {
    const listContainer = document.getElementById('instaclean-keep-checklist');
    const countSpan = document.getElementById('instaclean-keep-count');
    if (!listContainer) return;

    const skipList = parseSkipList(currentSettings.skipUsernames);
    if (countSpan) {
      countSpan.textContent = `🛡️ Keep Conversations (${skipList.length} Kept)`;
    }

    const threads = findInboxThreadItems();
    const itemsMap = new Map();

    // First include all currently kept names so they always stay visible at the top
    for (const keptName of skipList) {
      itemsMap.set(keptName, { title: keptName, isKept: true });
    }

    // Then include all visible inbox threads
    for (const threadEl of threads) {
      const { title } = getThreadIdentity(threadEl);
      const normTitle = title.toLowerCase().replace(/^@/, '').trim();
      if (!normTitle) continue;
      const matchedKept = skipList.find((u) => normTitle.includes(u) || u.includes(normTitle));
      if (matchedKept) {
        itemsMap.set(matchedKept, { title, isKept: true, normKey: matchedKept });
      } else if (!itemsMap.has(normTitle)) {
        itemsMap.set(normTitle, { title, isKept: false, normKey: normTitle });
      }
    }

    listContainer.textContent = '';
    if (itemsMap.size === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.color = '#a1a1aa';
      empty.textContent = 'Open inbox or type a name above to keep chats safe.';
      listContainer.appendChild(empty);
      return;
    }

    for (const [key, item] of itemsMap.entries()) {
      const row = document.createElement('label');
      row.className = `instaclean-keep-item${item.isKept ? ' instaclean-item-protected' : ''}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.isKept;
      cb.addEventListener('change', () => {
        toggleKeepConversationName(item.normKey || key, cb.checked);
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'instaclean-keep-name';
      nameSpan.textContent = item.title;

      const tag = document.createElement('span');
      tag.className = 'instaclean-keep-tag';
      tag.textContent = item.isKept ? '🛡️ Kept' : '🗑️ Delete';

      row.append(cb, nameSpan, tag);
      listContainer.appendChild(row);
    }
  }

  // Inject visual "🛡️ Keep" / "🗑️ Clean" toggle pill on each chat row in Inbox
  function syncRowProtectionToggles() {
    if (window.__instacleanClosedByUser || !window.location.pathname.startsWith('/direct')) return;
    const skipList = parseSkipList(currentSettings.skipUsernames);
    const threads = findInboxThreadItems();

    for (const threadEl of threads) {
      const { title } = getThreadIdentity(threadEl);
      const normTitle = title.toLowerCase().replace(/^@/, '').trim();
      if (!normTitle) continue;

      const isKept = skipList.some((u) => normTitle.includes(u) || u === normTitle);
      threadEl.classList.toggle('instaclean-row-protected', isKept);

      const computedPos = window.getComputedStyle(threadEl).position;
      if (computedPos === 'static') {
        threadEl.style.position = 'relative';
      }

      let toggleBtn = threadEl.querySelector('.instaclean-row-toggle');
      if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'instaclean-row-toggle';
        toggleBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await toggleKeepConversationName(normTitle);
        });
        threadEl.appendChild(toggleBtn);
      }

      toggleBtn.classList.toggle('instaclean-is-kept', isKept);
      toggleBtn.textContent = isKept ? '🛡️ Keep' : '🗑️ Clean';
      toggleBtn.title = isKept
        ? `"${title}" is protected and will be skipped. Click to allow deletion.`
        : `Click to protect "${title}" from bulk deletion.`;
    }

    renderKeepChecklistInWidget();
  }

  function findConversationInfoButton() {
    const selectors = [
      'svg[aria-label*="Conversation information" i]',
      'svg[aria-label*="Thread Details" i]',
      'svg[aria-label*="View Thread Details" i]',
      'svg[aria-label*="जानकारी" i]',
      '[aria-label*="Conversation information" i]',
      '[aria-label*="Thread Details" i]',
      '[aria-label*="View Thread Details" i]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) {
        return el.closest('button, [role="button"], [tabindex="0"]') || el;
      }
    }

    const headerButtons = Array.from(
      document.querySelectorAll(
        'main button, main [role="button"], [role="main"] button, [role="main"] [role="button"]'
      )
    ).filter((btn) => {
      if (!isVisible(btn)) return false;
      const r = btn.getBoundingClientRect();
      return (
        r.top >= 0 && r.top < 115 && r.left > window.innerWidth - 220 && btn.querySelector('svg')
      );
    });

    if (headerButtons.length > 0) {
      headerButtons.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
      return headerButtons[0];
    }
    return null;
  }

  function findDeleteChatButton() {
    return findClickableByText([
      /^(delete chat|delete conversation|delete thread)$/i,
      /^(चैट डिलीट करें|चैट हटाएं|बातचीत हटाएं)$/i
    ]);
  }

  function findLeaveChatButton() {
    return findClickableByText([
      /^(leave chat|leave group|leave conversation)$/i,
      /^(चैट छोड़ें|ग्रुप छोड़ें)$/i
    ]);
  }

  function findDialogConfirmDeleteButton() {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const confirmBtn = findClickableByText(
        [/^(delete|unsend|leave|डिलीट करें|हटाएं|भेजना रद्द करें|छोड़ें)$/i],
        dialog
      );
      if (confirmBtn) return confirmBtn;
    }
    return null;
  }

  async function closeConversationInfoDrawerIfOpen() {
    const deleteBtnVisible = findDeleteChatButton();
    if (!deleteBtnVisible) return;
    const infoBtn = findConversationInfoButton();
    if (infoBtn) {
      simulateClick(infoBtn);
      await sleep(450);
    }
  }

  async function trySwitchNextInboxTab() {
    const tabPatterns = [
      { id: 'general', rx: /^(general|जनरल)$/i },
      { id: 'requests', rx: /^(requests|message requests|अनुरोध)$/i }
    ];
    for (const item of tabPatterns) {
      if (visitedInboxTabs.has(item.id)) continue;
      const tabBtn = findClickableByText([item.rx]);
      if (tabBtn) {
        visitedInboxTabs.add(item.id);
        await updateJobState({
          currentAction: `Switching to "${item.id.toUpperCase()}" inbox tab...`,
          logEntry: `Switched to ${item.id} inbox tab`
        });
        simulateClick(tabBtn);
        await sleep(1600);
        return true;
      }
    }
    return false;
  }

  async function deleteCurrentlyOpenChat() {
    const directRequestDelete = findClickableByText([/^(delete|delete request|डिलीट करें)$/i]);
    if (directRequestDelete && !findDeleteChatButton()) {
      const r = directRequestDelete.getBoundingClientRect();
      if (r.top > window.innerHeight - 160) {
        simulateClick(directRequestDelete);
        await sleep(500);
        const confirmReq = await waitForElement(findDialogConfirmDeleteButton, 2200, 160);
        if (confirmReq) {
          simulateClick(confirmReq);
          await sleep(850);
          return { ok: true };
        }
      }
    }

    let deleteChatBtn = findDeleteChatButton();

    if (!deleteChatBtn) {
      const infoBtn = await waitForElement(findConversationInfoButton, 2200, 180);
      if (!infoBtn) {
        return { ok: false, reason: 'Could not find Conversation Info (i) button' };
      }
      await updateJobState({ currentAction: 'Opening Conversation Info panel...' });
      simulateClick(infoBtn);
      await sleep(680);
      deleteChatBtn = await waitForElement(findDeleteChatButton, 2600, 180);
    }

    const leaveChatBtn = findLeaveChatButton();
    if (leaveChatBtn && currentSettings.skipGroupChats) {
      await closeConversationInfoDrawerIfOpen();
      return { ok: false, skippedGroup: true, reason: 'Skipped group chat per settings' };
    }

    if (!deleteChatBtn && leaveChatBtn) {
      await updateJobState({ currentAction: 'Leaving group chat before deletion...' });
      simulateClick(leaveChatBtn);
      await sleep(500);
      const confirmLeave = await waitForElement(findDialogConfirmDeleteButton, 2200, 160);
      if (confirmLeave) {
        simulateClick(confirmLeave);
        await sleep(900);
      }
      deleteChatBtn = await waitForElement(findDeleteChatButton, 2000, 180);
      if (!deleteChatBtn) {
        return { ok: true };
      }
    }

    if (!deleteChatBtn || stopRequested) {
      return { ok: false, reason: 'Could not find "Delete chat" button in info panel' };
    }

    await highlightElementsBatch([deleteChatBtn], true);
    await updateJobState({ currentAction: 'Clicking "Delete chat"...' });
    simulateClick(deleteChatBtn);
    await sleep(500);

    const confirmBtn = await waitForElement(findDialogConfirmDeleteButton, 2800, 160);
    if (!confirmBtn || stopRequested) {
      await highlightElementsBatch([deleteChatBtn], false);
      return { ok: false, reason: 'Confirmation dialog did not appear' };
    }

    await highlightElementsBatch([confirmBtn], true);
    await updateJobState({ currentAction: 'Confirming permanent chat deletion...' });
    simulateClick(confirmBtn);
    await sleep(900);
    return { ok: true };
  }

  function findChatMessagesScrollContainer() {
    const allDivs = document.querySelectorAll('div');
    let best = null;
    for (const div of allDivs) {
      const rect = div.getBoundingClientRect();
      if (rect.left > 350 && rect.width > 350 && rect.height > 200) {
        const style = window.getComputedStyle(div);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          div.scrollHeight > div.clientHeight + 5
        ) {
          if (!best || div.scrollHeight > best.scrollHeight) {
            best = div;
          }
        }
      }
    }
    return best;
  }

  // Scroll up inside the open chat (supports Instagram's flex-direction: column-reverse negative scrollTop!)
  async function scrollChatMessagesUp(scroller) {
    if (!scroller) return false;
    const style = window.getComputedStyle(scroller);
    const before = scroller.scrollTop;
    if (style.flexDirection === 'column-reverse') {
      scroller.scrollTop = before - 650;
    } else {
      scroller.scrollTop = Math.max(0, before - 650);
    }
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -650, bubbles: true }));
    await sleep(1250);
    return Math.abs(scroller.scrollTop - before) > 2;
  }

  // Find candidate sent messages using Instagram's native "See more options for message..." buttons + right-aligned bubbles
  function findCandidateSentMessageActions() {
    const scroller = findChatMessagesScrollContainer();
    const containerRect = scroller
      ? scroller.getBoundingClientRect()
      : { left: 450, right: window.innerWidth, top: 75, bottom: window.innerHeight - 75 };

    const centerLine = containerRect.left + (containerRect.right - containerRect.left) * 0.42;
    const results = [];

    // Strategy A: Direct "See more options for message from ..." SVGs on right-aligned (your) messages
    const moreSvgs = document.querySelectorAll(
      'svg[aria-label*="See more options for message" i], [role="button"][aria-label*="See more options for message" i]'
    );

    for (const node of moreSvgs) {
      const btn = node.closest('button, [role="button"], [tabindex="0"]') || node.parentElement;
      if (!btn || processedMessageEls.has(btn)) continue;
      const r = btn.getBoundingClientRect();
      // Right-aligned messages sent by you have their action toolbar on the right half of the chat area
      if (r.left >= centerLine && r.width > 0 && r.height > 0) {
        results.push({
          moreBtn: btn,
          rect: r,
          label: node.getAttribute('aria-label') || 'Sent message'
        });
      }
    }

    // Sort from bottom (newest, largest top) to top
    results.sort((a, b) => b.rect.top - a.rect.top);
    return results;
  }

  function findUnsendMenuOption() {
    return findClickableByText([
      /^(unsend|unsend message)$/i,
      /^(भेजना रद्द करें|अनसेंड करें)$/i
    ]);
  }

  async function checkAndHandleRateLimits(deletedCount) {
    const rateLimit = detectRateLimitModal();
    if (rateLimit.detected) {
      if (rateLimit.dismissBtn) {
        simulateClick(rateLimit.dismissBtn);
      }
      await updateJobState({
        logEntry: 'Instagram rate-limit modal detected! Entering 60s safety cooldown.'
      });
      await runCooldownCountdown(60, 'Rate-limit detected');
      return;
    }

    if (
      currentSettings.batchCooldown &&
      deletedCount > 0 &&
      deletedCount % Math.max(5, Number(currentSettings.batchSize) || 20) === 0
    ) {
      const waitSecs = Math.max(5, Number(currentSettings.cooldownSeconds) || 25);
      await updateJobState({
        logEntry: `Batch cooldown (${waitSecs}s) after ${deletedCount} deletions`
      });
      await runCooldownCountdown(waitSecs, `Batch safety pause (${deletedCount} cleaned)`);
    }
  }

  async function runUnsendMessagesInCurrentChat(maxLimit = 0) {
    await closeConversationInfoDrawerIfOpen();

    let unsentInThisChat = 0;
    let scrollUpAttempts = 0;
    const maxScrollUpAttempts = 18;

    while (!stopRequested) {
      await waitWhilePaused();
      if (stopRequested) break;

      const { jobState = {} } = await chrome.storage.local.get('jobState');
      const totalDeleted = jobState.deletedCount || 0;
      if (maxLimit > 0 && totalDeleted >= maxLimit) {
        await updateJobState({
          currentAction: `Reached max limit (${maxLimit}).`,
          logEntry: `Reached user limit of ${maxLimit} items.`
        });
        break;
      }

      const candidates = findCandidateSentMessageActions();
      // Filter to those currently visible or scroll them into view
      const inView = candidates.filter(
        (c) => c.rect.top >= 80 && c.rect.bottom <= window.innerHeight - 70
      );

      let target = inView[0] || candidates[0];

      if (!target) {
        if (!currentSettings.autoScroll || scrollUpAttempts >= maxScrollUpAttempts) {
          break;
        }
        scrollUpAttempts++;
        const scroller = findChatMessagesScrollContainer();
        if (scroller) {
          await updateJobState({
            currentAction: `Scrolling up in chat for older messages (${scrollUpAttempts}/${maxScrollUpAttempts})...`
          });
          const moved = await scrollChatMessagesUp(scroller);
          if (!moved && scrollUpAttempts >= 3) {
            break;
          }
          continue;
        } else {
          break;
        }
      }

      scrollUpAttempts = 0;
      processedMessageEls.add(target.moreBtn);

      // If the button is slightly outside the vertical viewport, scroll it into center view first
      if (target.rect.top < 85 || target.rect.bottom > window.innerHeight - 75) {
        try {
          target.moreBtn.scrollIntoView({ block: 'center' });
          await sleep(350);
        } catch (_) {
          // Ignore scrollIntoView errors
        }
      }

      await highlightElementsBatch([target.moreBtn], true);
      simulateHover(target.moreBtn);
      await sleep(220);

      simulateClick(target.moreBtn);
      await sleep(400);

      const unsendOption = await waitForElement(findUnsendMenuOption, 1200, 140);
      if (!unsendOption) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await highlightElementsBatch([target.moreBtn], false);
        const st = await chrome.storage.local.get('jobState');
        await updateJobState({
          skippedCount: (st.jobState?.skippedCount || 0) + 1
        });
        await sleep(220);
        continue;
      }

      await updateJobState({ currentAction: 'Clicking "Unsend" on message...' });
      simulateClick(unsendOption);
      await sleep(450);

      const confirmBtn = await waitForElement(findDialogConfirmDeleteButton, 1800, 150);
      if (confirmBtn) {
        simulateClick(confirmBtn);
        await sleep(550);
      }

      unsentInThisChat++;
      const latest = await chrome.storage.local.get('jobState');
      const newCount = (latest.jobState?.deletedCount || 0) + 1;
      await updateJobState({
        deletedCount: newCount,
        currentAction: `Unsent ${newCount} message(s)...`,
        logEntry: `Unsent message #${newCount}`,
        historyItem: {
          type: 'message_unsent',
          title: target.label || `Message #${newCount}`
        }
      });

      await highlightElementsBatch([target.moreBtn], false);
      await checkAndHandleRateLimits(newCount);
      await sleep(randomJitter(currentSettings.delayMs));
    }

    return unsentInThisChat;
  }

  async function runDeleteChatsLoop() {
    const maxLimit = Number(currentSettings.maxItems) || 0;
    let consecutiveScrollsWithoutThreads = 0;
    const maxInboxScrolls = 20;

    if (!window.location.pathname.startsWith('/direct')) {
      await updateJobState({
        currentAction: 'Redirecting to Instagram Direct Inbox...',
        logEntry: 'Navigating to /direct/inbox/'
      });
      await chrome.storage.local.set({ pendingAutoStart: true });
      window.location.href = 'https://www.instagram.com/direct/inbox/';
      return;
    }

    await updateJobState({
      currentAction: 'Scanning Instagram Direct inbox threads...',
      logEntry: `Started in mode: ${currentSettings.mode}`
    });

    // Ensure inbox starts at the top so no upper threads are missed
    const initialScroller = findInboxScrollContainer();
    if (initialScroller && initialScroller.scrollTop > 100) {
      await updateJobState({ currentAction: 'Scrolling inbox list to top...' });
      await scrollInboxList(initialScroller, 'top');
    }

    await waitForElement(() => {
      const items = findInboxThreadItems();
      return items.length > 0 ? items : null;
    }, 5000, 300);

    while (!stopRequested) {
      await waitWhilePaused();
      if (stopRequested) break;

      const { jobState = {} } = await chrome.storage.local.get('jobState');
      const deletedSoFar = jobState.deletedCount || 0;
      if (maxLimit > 0 && deletedSoFar >= maxLimit) {
        await updateJobState({
          currentAction: `Completed! Reached target limit of ${maxLimit}.`,
          logEntry: `Finished after deleting ${deletedSoFar} items.`
        });
        break;
      }

      const skipList = parseSkipList(currentSettings.skipUsernames);
      const allThreads = findInboxThreadItems().filter((el) => {
        const { key } = getThreadIdentity(el);
        return !skippedThreadKeys.has(key);
      });

      if (allThreads.length === 0) {
        if (currentSettings.autoScroll && consecutiveScrollsWithoutThreads < maxInboxScrolls) {
          consecutiveScrollsWithoutThreads++;
          const scroller = findInboxScrollContainer();
          if (scroller) {
            const atBottom =
              scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 25;
            if (atBottom && scroller.scrollTop > 80 && consecutiveScrollsWithoutThreads > 3) {
              await updateJobState({
                currentAction: 'Reached bottom of inbox — scrolling back to top to check remaining chats...'
              });
              await scrollInboxList(scroller, 'top');
              continue;
            }

            await updateJobState({
              currentAction: `Scrolling inbox list down for more chats (${consecutiveScrollsWithoutThreads}/${maxInboxScrolls})...`
            });
            await scrollInboxList(scroller, 'down');
            continue;
          }
        }

        if (currentSettings.includeRequestsAndGeneral) {
          const switched = await trySwitchNextInboxTab();
          if (switched) {
            consecutiveScrollsWithoutThreads = 0;
            continue;
          }
        }

        await updateJobState({
          currentAction: 'All chats in inbox have been processed!',
          logEntry: 'All visible & scrollable chats processed.'
        });
        break;
      }

      consecutiveScrollsWithoutThreads = 0;
      const threadEl = allThreads[0];
      const { key: threadKey, title: threadSummary, isGroup } = getThreadIdentity(threadEl);

      // Check whitelist / skip list
      const shouldSkip = skipList.some((u) => threadSummary.toLowerCase().includes(u));
      if (shouldSkip) {
        skippedThreadKeys.add(threadKey);
        const st = await chrome.storage.local.get('jobState');
        await updateJobState({
          skippedCount: (st.jobState?.skippedCount || 0) + 1,
          currentAction: `Skipped protected chat: ${threadSummary}`,
          logEntry: `Skipped protected chat "${threadSummary}"`
        });
        // If all visible threads are skipped, scroll down smoothly
        if (allThreads.length <= 1) {
          const scroller = findInboxScrollContainer();
          if (scroller) await scrollInboxList(scroller, 'down');
        } else {
          await sleep(250);
        }
        continue;
      }

      if (currentSettings.skipGroupChats && isGroup) {
        skippedThreadKeys.add(threadKey);
        const st = await chrome.storage.local.get('jobState');
        await updateJobState({
          skippedCount: (st.jobState?.skippedCount || 0) + 1,
          currentAction: `Skipped group chat: ${threadSummary}`,
          logEntry: `Skipped group chat "${threadSummary}"`
        });
        if (allThreads.length <= 1) {
          const scroller = findInboxScrollContainer();
          if (scroller) await scrollInboxList(scroller, 'down');
        } else {
          await sleep(250);
        }
        continue;
      }

      await highlightElementsBatch([threadEl], true);
      await updateJobState({
        currentAction: `Opening chat: "${threadSummary.slice(0, 28)}"...`
      });

      // Click at 58% width (middle text area) to avoid left avatar Story ring and right Keep button!
      simulateClick(threadEl, 0.58);
      await sleep(1050);

      if (stopRequested) {
        await highlightElementsBatch([threadEl], false);
        break;
      }

      if (currentSettings.mode === 'unsend_then_delete') {
        await updateJobState({
          currentAction: `Unsending your messages in "${threadSummary.slice(0, 24)}"...`
        });
        await runUnsendMessagesInCurrentChat(0);
      }

      const deleteResult = await deleteCurrentlyOpenChat();
      await highlightElementsBatch([threadEl], false);

      if (deleteResult.ok) {
        const st = await chrome.storage.local.get('jobState');
        const nextDeleted = (st.jobState?.deletedCount || 0) + 1;
        await updateJobState({
          deletedCount: nextDeleted,
          currentAction: `Deleted "${threadSummary.slice(0, 24)}" (Total: ${nextDeleted})`,
          logEntry: `Deleted chat "${threadSummary.slice(0, 28)}"`,
          historyItem: { type: 'chat_deleted', title: threadSummary }
        });

        // Proactively scroll inbox list when remaining visible threads get low so Instagram loads the next batch of conversations
        if (allThreads.length <= 4 && currentSettings.autoScroll) {
          await triggerInboxPaginationLoad();
        }

        await checkAndHandleRateLimits(nextDeleted);
      } else if (deleteResult.skippedGroup) {
        skippedThreadKeys.add(threadKey);
        const st = await chrome.storage.local.get('jobState');
        await updateJobState({
          skippedCount: (st.jobState?.skippedCount || 0) + 1,
          currentAction: `Skipped group chat "${threadSummary.slice(0, 20)}"`,
          logEntry: `Skipped group chat "${threadSummary.slice(0, 24)}"`
        });
      } else {
        skippedThreadKeys.add(threadKey);
        const st = await chrome.storage.local.get('jobState');
        await updateJobState({
          errorCount: (st.jobState?.errorCount || 0) + 1,
          currentAction: `Skipped "${threadSummary.slice(0, 20)}": ${deleteResult.reason}`,
          logEntry: `Could not delete "${threadSummary.slice(0, 24)}": ${deleteResult.reason}`
        });
      }

      await sleep(randomJitter(currentSettings.delayMs));
    }
  }

  async function startAutomation(settingsOverride) {
    if (isRunning) {
      if (isPaused) {
        resumeAutomation();
      }
      return { ok: true, alreadyRunning: true };
    }

    const stored = await chrome.storage.local.get(['settings', 'jobState']);
    currentSettings = {
      ...DEFAULT_SETTINGS,
      ...(stored.settings || {}),
      ...(settingsOverride || {})
    };

    isRunning = true;
    isPaused = false;
    stopRequested = false;
    skippedThreadKeys.clear();
    visitedInboxTabs.clear();

    await chrome.storage.local.set({ pendingAutoStart: true });
    await updateJobState({
      status: 'running',
      currentAction: 'Starting Instagram DM cleaner...',
      logEntry: `Job started (${currentSettings.mode})`
    });

    try {
      if (currentSettings.mode === 'unsend_messages') {
        const maxLimit = Number(currentSettings.maxItems) || 0;
        await runUnsendMessagesInCurrentChat(maxLimit);
      } else {
        await runDeleteChatsLoop();
      }
    } catch (err) {
      console.error('InstaClean execution error:', err);
      const st = await chrome.storage.local.get('jobState');
      await updateJobState({
        errorCount: (st.jobState?.errorCount || 0) + 1,
        currentAction: `Error: ${err?.message || 'Automation interrupted'}`,
        logEntry: `Error: ${err?.message || 'Unknown error'}`
      });
    } finally {
      const wasStopped = stopRequested;
      isRunning = false;
      isPaused = false;
      stopRequested = false;
      await chrome.storage.local.set({ pendingAutoStart: false });
      await updateJobState({
        status: 'idle',
        currentAction: wasStopped
          ? 'Stopped by user.'
          : 'Finished! Select a mode and click Start anytime.',
        logEntry: wasStopped ? 'Job stopped by user.' : 'Job finished.'
      });
    }
  }

  function pauseAutomation() {
    if (!isRunning || isPaused) return;
    isPaused = true;
    updateJobState({
      status: 'paused',
      currentAction: '⏸ Paused. Click Resume to continue.',
      logEntry: 'Job paused by user.'
    });
  }

  function resumeAutomation() {
    if (!isRunning || !isPaused) return;
    isPaused = false;
    updateJobState({
      status: 'running',
      currentAction: '▶ Resumed deletion...',
      logEntry: 'Job resumed by user.'
    });
  }

  function stopAutomation() {
    stopRequested = true;
    isPaused = false;
    isRunning = false;
    chrome.storage.local.set({ pendingAutoStart: false });
    updateJobState({
      status: 'idle',
      currentAction: 'Stopping after current step...',
      logEntry: 'Stop requested by user.'
    });
  }

  function ensureFloatingWidget() {
    let root = document.getElementById('instaclean-floating-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'instaclean-floating-root';

    const widget = document.createElement('div');
    widget.className = 'instaclean-widget';
    widget.id = 'instaclean-widget-card';

    const header = document.createElement('div');
    header.className = 'instaclean-header';

    const brand = document.createElement('div');
    brand.className = 'instaclean-brand';

    const dot = document.createElement('span');
    dot.className = 'instaclean-dot';
    dot.id = 'instaclean-live-dot';

    const title = document.createElement('span');
    title.textContent = 'InstaClean v2.0';

    brand.append(dot, title);

    const controls = document.createElement('div');
    controls.className = 'instaclean-header-controls';

    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'instaclean-min-btn';
    minBtn.title = 'Minimize / Expand panel';
    minBtn.textContent = '—';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'instaclean-close-btn';
    closeBtn.id = 'instaclean-close-btn';
    closeBtn.title = 'Close panel (stops active job)';
    closeBtn.textContent = '✕';

    const reopenPill = document.createElement('div');
    reopenPill.className = 'instaclean-reopen-pill';
    reopenPill.id = 'instaclean-reopen-pill';
    reopenPill.textContent = '🧹 Open InstaClean';
    reopenPill.title = 'Click to reopen InstaClean panel';

    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const minimized = widget.classList.toggle('instaclean-minimized');
      minBtn.textContent = minimized ? '+' : '—';
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isRunning) {
        stopAutomation();
      }
      window.__instacleanClosedByUser = true;
      widget.style.display = 'none';
      reopenPill.style.display = 'flex';
      document.querySelectorAll('.instaclean-row-toggle').forEach((el) => el.remove());
      document
        .querySelectorAll('.instaclean-row-protected')
        .forEach((el) => el.classList.remove('instaclean-row-protected'));
    });

    reopenPill.addEventListener('click', () => {
      window.__instacleanClosedByUser = false;
      reopenPill.style.display = 'none';
      widget.style.display = 'block';
      syncRowProtectionToggles();
    });

    header.addEventListener('click', () => {
      if (widget.classList.contains('instaclean-minimized')) {
        widget.classList.remove('instaclean-minimized');
        minBtn.textContent = '—';
      }
    });

    controls.append(minBtn, closeBtn);
    header.append(brand, controls);

    const body = document.createElement('div');
    body.className = 'instaclean-body';

    const statsRow = document.createElement('div');
    statsRow.className = 'instaclean-stats-row';

    const makeStat = (id, labelText) => {
      const box = document.createElement('div');
      box.className = 'instaclean-stat-box';
      const val = document.createElement('div');
      val.className = 'instaclean-stat-val';
      val.id = id;
      val.textContent = '0';
      const lbl = document.createElement('div');
      lbl.className = 'instaclean-stat-lbl';
      lbl.textContent = labelText;
      box.append(val, lbl);
      return box;
    };

    statsRow.append(
      makeStat('instaclean-stat-deleted', 'Deleted'),
      makeStat('instaclean-stat-skipped', 'Skipped'),
      makeStat('instaclean-stat-errors', 'Errors')
    );

    const modeSelect = document.createElement('select');
    modeSelect.className = 'instaclean-mode-select';
    modeSelect.id = 'instaclean-widget-mode';
    modeSelect.setAttribute('aria-label', 'Deletion Mode');

    const modes = [
      { value: 'delete_chats', label: '🗑️ Delete All Chats (Inbox)' },
      { value: 'unsend_messages', label: '↩️ Unsend Sent Messages (Open Chat)' },
      { value: 'unsend_then_delete', label: '🔥 Full Wipe (Unsend + Delete Chats)' }
    ];
    for (const m of modes) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      modeSelect.appendChild(opt);
    }

    modeSelect.addEventListener('change', async () => {
      const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
      const updated = { ...settings, mode: modeSelect.value };
      currentSettings = updated;
      await chrome.storage.local.set({ settings: updated });
    });

    // Conversation Keep Manager Section inside Floating Panel
    const keepBox = document.createElement('div');
    keepBox.className = 'instaclean-keep-box';

    const keepHeader = document.createElement('div');
    keepHeader.className = 'instaclean-keep-header';

    const keepCount = document.createElement('span');
    keepCount.id = 'instaclean-keep-count';
    keepCount.textContent = '🛡️ Keep Conversations (0 Kept)';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'instaclean-keep-refresh';
    refreshBtn.textContent = '🔄 Scan List';
    refreshBtn.addEventListener('click', () => {
      syncRowProtectionToggles();
    });

    keepHeader.append(keepCount, refreshBtn);

    const keepInputRow = document.createElement('div');
    keepInputRow.className = 'instaclean-keep-input-row';

    const keepInput = document.createElement('input');
    keepInput.type = 'text';
    keepInput.className = 'instaclean-keep-input';
    keepInput.placeholder = 'Type name/username to keep safe...';

    const keepAddBtn = document.createElement('button');
    keepAddBtn.type = 'button';
    keepAddBtn.className = 'instaclean-keep-add-btn';
    keepAddBtn.textContent = '+ Keep';

    const addCustomKeep = async () => {
      const val = keepInput.value.trim();
      if (!val) return;
      keepInput.value = '';
      await toggleKeepConversationName(val, true);
    };

    keepAddBtn.addEventListener('click', addCustomKeep);
    keepInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomKeep();
      }
    });

    keepInputRow.append(keepInput, keepAddBtn);

    const keepChecklist = document.createElement('div');
    keepChecklist.className = 'instaclean-keep-list';
    keepChecklist.id = 'instaclean-keep-checklist';

    keepBox.append(keepHeader, keepInputRow, keepChecklist);

    const statusBox = document.createElement('div');
    statusBox.className = 'instaclean-status-box';
    statusBox.id = 'instaclean-widget-status';
    statusBox.textContent = 'Ready. Tick chats above to Keep 🛡️ or click Start.';

    const actions = document.createElement('div');
    actions.className = 'instaclean-actions';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'instaclean-btn instaclean-btn-start';
    startBtn.id = 'instaclean-widget-start';
    startBtn.textContent = '▶ Start';

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'instaclean-btn instaclean-btn-pause';
    pauseBtn.id = 'instaclean-widget-pause';
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.disabled = true;

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'instaclean-btn instaclean-btn-stop';
    stopBtn.id = 'instaclean-widget-stop';
    stopBtn.textContent = '⏹ Stop';
    stopBtn.disabled = true;

    startBtn.addEventListener('click', () => {
      startAutomation({ mode: modeSelect.value });
    });

    pauseBtn.addEventListener('click', () => {
      if (isPaused) {
        resumeAutomation();
      } else {
        pauseAutomation();
      }
    });

    stopBtn.addEventListener('click', () => {
      stopAutomation();
    });

    actions.append(startBtn, pauseBtn, stopBtn);
    body.append(statsRow, modeSelect, keepBox, statusBox, actions);
    widget.append(header, body);
    root.append(widget, reopenPill);
    document.body.appendChild(root);

    (async () => {
      const {
        settings = DEFAULT_SETTINGS,
        jobState = {},
        pendingAutoStart = false
      } = await chrome.storage.local.get(['settings', 'jobState', 'pendingAutoStart']);
      currentSettings = { ...DEFAULT_SETTINGS, ...settings };
      modeSelect.value = currentSettings.mode || 'delete_chats';
      renderFloatingWidgetState(jobState);
      syncRowProtectionToggles();

      // Auto-resume if a page reload happened mid-job!
      if ((pendingAutoStart || jobState.status === 'running') && !isRunning) {
        setTimeout(() => {
          if (!isRunning) {
            startAutomation(currentSettings);
          }
        }, 1200);
      }
    })();

    return root;
  }

  function renderFloatingWidgetState(jobState) {
    if (!jobState) return;
    const root = document.getElementById('instaclean-floating-root');
    if (!root) return;

    const delEl = document.getElementById('instaclean-stat-deleted');
    const skipEl = document.getElementById('instaclean-stat-skipped');
    const errEl = document.getElementById('instaclean-stat-errors');
    const statusEl = document.getElementById('instaclean-widget-status');
    const dotEl = document.getElementById('instaclean-live-dot');
    const startBtn = document.getElementById('instaclean-widget-start');
    const pauseBtn = document.getElementById('instaclean-widget-pause');
    const stopBtn = document.getElementById('instaclean-widget-stop');

    if (delEl) delEl.textContent = String(jobState.deletedCount || 0);
    if (skipEl) skipEl.textContent = String(jobState.skippedCount || 0);
    if (errEl) errEl.textContent = String(jobState.errorCount || 0);
    if (statusEl && jobState.currentAction) {
      statusEl.textContent = jobState.currentAction;
    }

    const active =
      jobState.status === 'running' ||
      jobState.status === 'paused' ||
      jobState.status === 'cooldown' ||
      isRunning;
    const pausedOrCooldown =
      jobState.status === 'paused' || jobState.status === 'cooldown' || isPaused;

    if (dotEl) {
      dotEl.classList.toggle('instaclean-dot-running', active && !pausedOrCooldown);
      dotEl.classList.toggle('instaclean-dot-paused', pausedOrCooldown);
    }
    if (startBtn) startBtn.disabled = active;
    if (pauseBtn) {
      pauseBtn.disabled = !active;
      pauseBtn.textContent = isPaused || jobState.status === 'paused' ? '▶ Resume' : '⏸ Pause';
    }
    if (stopBtn) stopBtn.disabled = !active;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONTENT_PING') {
      ensureFloatingWidget();
      sendResponse({ ready: true, isRunning, isPaused });
      return true;
    }

    if (message.type === 'CONTENT_START_JOB') {
      ensureFloatingWidget();
      startAutomation(message.settings);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'CONTENT_PAUSE_JOB') {
      pauseAutomation();
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'CONTENT_RESUME_JOB') {
      resumeAutomation();
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'CONTENT_STOP_JOB') {
      stopAutomation();
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.jobState?.newValue) {
      renderFloatingWidgetState(changes.jobState.newValue);
    }
    if (changes.settings?.newValue) {
      currentSettings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      const modeSelect = document.getElementById('instaclean-widget-mode');
      if (modeSelect && changes.settings.newValue.mode) {
        modeSelect.value = changes.settings.newValue.mode;
      }
      syncRowProtectionToggles();
    }
  });

  let toggleSyncScheduled = false;
  const domObserver = new MutationObserver(() => {
    if (toggleSyncScheduled) return;
    toggleSyncScheduled = true;
    setTimeout(() => {
      toggleSyncScheduled = false;
      syncRowProtectionToggles();
    }, 650);
  });

  function init() {
    if (document.body) {
      ensureFloatingWidget();
      syncRowProtectionToggles();
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  init();
  chrome.runtime.sendMessage({ type: 'CONTENT_READY' }).catch(() => {});
})();
