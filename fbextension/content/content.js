(() => {
  if (window.__fbcleanContentLoaded) return;
  window.__fbcleanContentLoaded = true;

  // Seamless fallback if injected directly into browser tab outside extension context
  if (!globalThis.chrome?.storage?.local) {
    const listeners = [];
    const readStore = () => {
      try {
        return JSON.parse(localStorage.getItem('__fbclean_store__') || '{}');
      } catch (_) {
        return {};
      }
    };
    const writeStore = (obj) => {
      try {
        localStorage.setItem('__fbclean_store__', JSON.stringify(obj));
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
    delayMs: 1600,
    maxItems: 0,
    skipUsernames: '',
    autoScroll: true,
    batchCooldown: true,
    batchSize: 20,
    cooldownSeconds: 20,
    includeRequestsAndGeneral: true,
    skipGroupChats: false
  };

  let isRunning = false;
  let isPaused = false;
  let stopRequested = false;
  let currentSettings = { ...DEFAULT_SETTINGS };
  window.__fbcleanStopOldInstance = () => {
    stopRequested = true;
    isRunning = false;
  };

  const skippedThreadKeys = new Set();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function randomJitter(baseMs) {
    const jitter = Math.floor(Math.random() * 350) + 100;
    return Math.max(700, Number(baseMs || 1600) + jitter);
  }

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
        currentAction: 'Ready to clean Facebook Chats',
        ...jobState,
        ...rest,
        logs,
        deletedHistory
      };
      await chrome.storage.local.set({ jobState: next });
      renderFloatingWidgetState(next);
      return next;
    } catch (err) {
      console.warn('FBClean storage update error:', err);
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
    const clientX = rect.left + rect.width * 0.5;
    const clientY = rect.top + rect.height * 0.5;
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

  async function waitForElement(finderFn, timeoutMs = 2600, intervalMs = 160) {
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

  // Locate the scrollable Left Chats Sidebar container on Facebook Messenger
  function findFBInboxScrollContainer() {
    const allDivs = document.querySelectorAll('div');
    let best = null;
    for (const div of allDivs) {
      const rect = div.getBoundingClientRect();
      if (
        rect.left >= 0 &&
        rect.left < 180 &&
        rect.width > 220 &&
        rect.width < 500 &&
        rect.height > 200
      ) {
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

  function getFBThreadIdentity(threadEl) {
    if (!threadEl) return { key: '', title: 'Chat', isGroup: false };
    const link =
      threadEl.tagName === 'A'
        ? threadEl
        : threadEl.querySelector('a[href*="/messages/t/"], a[href*="/t/"]');
    const href = link ? (link.getAttribute('href') || '').split('?')[0] : '';

    const moreBtn = threadEl.querySelector(
      '[aria-label*="के लिए अन्य विकल्प"], [aria-label*="More options for" i]'
    );
    let ariaTitle = '';
    if (moreBtn) {
      ariaTitle = (moreBtn.getAttribute('aria-label') || '')
        .replace(/\s*के लिए अन्य विकल्प\s*$/i, '')
        .replace(/^\s*More options for\s+/i, '')
        .trim();
    }

    const lines = (threadEl.innerText || threadEl.textContent || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.includes('🛡️') && !s.includes('🗑️'));

    const title = ariaTitle || lines[0] || 'Facebook Chat';
    const normTitle = title.toLowerCase();
    const isDeactivated =
      normTitle === 'facebook user' || normTitle === 'facebook यूज़र';
    const key =
      href ||
      (isDeactivated
        ? `fbthread:${normTitle}|${(lines[1] || '').toLowerCase()}`
        : `fbthread:${normTitle}`);

    return { key, title, isGroup: false };
  }

  // Find Facebook Messenger conversation rows in the left sidebar
  function findFBInboxThreadItems() {
    const ignoredTexts =
      /^(chats|inbox|communities|marketplace|requests|archive|search messenger|new message|चैट|इनबॉक्स)$/i;

    const scroller = findFBInboxScrollContainer();
    const scrollerRect = scroller
      ? scroller.getBoundingClientRect()
      : { top: 110, bottom: window.innerHeight, left: 0, right: 450 };

    const minTop = Math.max(95, scrollerRect.top - 8);
    const maxBottom = Math.min(window.innerHeight - 4, scrollerRect.bottom + 8);

    const searchRoot = scroller || document;
    const results = [];
    const seen = new Set();

    const addCandidate = (el) => {
      if (!el || seen.has(el) || !isVisible(el)) return;
      if (el.closest('#instaclean-floating-root, [role="dialog"], [role="menu"]')) return;

      const row = el.closest('[role="row"], [role="listitem"]') || el;
      if (seen.has(row)) return;

      const rect = row.getBoundingClientRect();
      if (rect.left > 450) return;
      if (rect.width < 180 || rect.height < 48 || rect.height > 130) return;

      const centerY = rect.top + rect.height / 2;
      if (centerY < minTop + 10 || centerY > maxBottom - 10) return;

      const clone = row.cloneNode(true);
      clone.querySelectorAll('.instaclean-row-toggle').forEach((n) => n.remove());
      const text = (clone.innerText || clone.textContent || '').trim();
      if (!text || ignoredTexts.test(text)) return;

      for (const existing of results) {
        const er = existing.getBoundingClientRect();
        if (Math.abs(er.top - rect.top) < 24) {
          return;
        }
      }

      seen.add(row);
      results.push(row);
    };

    const candidates = searchRoot.querySelectorAll(
      'a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"], a[href^="/t/"], [role="grid"] [role="row"], [role="navigation"] [role="row"], [aria-label*="Chats" i] [role="row"], [aria-label*="Thread" i] [role="row"]'
    );
    for (const c of candidates) {
      addCandidate(c);
    }

    results.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return results;
  }

  async function scrollFBInboxList(scroller, direction = 'down') {
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

  async function triggerFBInboxPaginationLoad() {
    const scroller = findFBInboxScrollContainer();
    if (!scroller) return;
    const prevTop = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 700, bubbles: true }));
    await sleep(900);
    if (prevTop < scroller.scrollTop - 600) {
      scroller.scrollTop = prevTop + 300;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(450);
    }
  }

  // Helper to toggle keeping/protecting a conversation name in storage
  async function toggleKeepConversationName(rawName, forceKeep = null) {
    const normTitle = String(rawName || '').toLowerCase().trim();
    if (!normTitle) return;

    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
    const list = parseSkipList(settings.skipUsernames);
    const idx = list.findIndex((u) => normTitle.includes(u) || u === normTitle);

    if (forceKeep === true) {
      if (idx === -1) list.push(normTitle);
    } else if (forceKeep === false) {
      if (idx >= 0) list.splice(idx, 1);
    } else {
      if (idx >= 0) list.splice(idx, 1);
      else list.push(normTitle);
    }

    const updatedSkip = list.join(', ');
    const nextSettings = { ...DEFAULT_SETTINGS, ...settings, skipUsernames: updatedSkip };
    currentSettings = nextSettings;
    await chrome.storage.local.set({ settings: nextSettings });
    syncRowProtectionToggles();
    renderKeepChecklistInWidget();
  }

  // Render the Keep Conversations checklist inside the floating widget
  function renderKeepChecklistInWidget() {
    const listContainer = document.getElementById('instaclean-keep-checklist');
    const countLabel = document.getElementById('instaclean-keep-title-count');
    if (!listContainer) return;

    const skipList = parseSkipList(currentSettings.skipUsernames);
    if (countLabel) {
      countLabel.textContent = `🛡️ Keep Conversations (${skipList.length} Kept)`;
    }

    const threads = findFBInboxThreadItems();
    const seen = new Set();
    const items = [];

    // First include all saved/kept names so user can always see & uncheck them
    for (const saved of skipList) {
      if (!seen.has(saved)) {
        seen.add(saved);
        items.push({ display: saved, norm: saved, isKept: true });
      }
    }

    // Then include currently visible inbox conversations
    for (const threadEl of threads) {
      const { title } = getFBThreadIdentity(threadEl);
      const cleanTitle = (title || '').trim();
      const normTitle = cleanTitle.toLowerCase();
      if (!normTitle || seen.has(normTitle)) continue;
      const isKept = skipList.some((u) => normTitle.includes(u) || u === normTitle);
      seen.add(normTitle);
      items.push({ display: cleanTitle, norm: normTitle, isKept });
    }

    listContainer.textContent = '';

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'instaclean-keep-empty';
      emptyEl.textContent = 'Type a name above or click Scan to list chats.';
      listContainer.appendChild(emptyEl);
      return;
    }

    for (const item of items) {
      const row = document.createElement('label');
      row.className = `instaclean-keep-item${item.isKept ? ' is-kept' : ''}`;

      const left = document.createElement('div');
      left.className = 'instaclean-keep-item-left';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.isKept;
      cb.addEventListener('change', () => {
        toggleKeepConversationName(item.display, cb.checked);
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'instaclean-keep-name';
      nameSpan.textContent = item.display;
      nameSpan.title = item.display;

      left.append(cb, nameSpan);

      const badge = document.createElement('span');
      badge.className = `instaclean-keep-badge ${item.isKept ? 'kept' : 'delete'}`;
      badge.textContent = item.isKept ? '🛡️ KEEP' : '🗑️ DEL';

      row.append(left, badge);
      listContainer.appendChild(row);
    }
  }

  // Inject visual "🛡️ Keep / 🗑️ Clean" toggle on each Facebook chat row
  function syncRowProtectionToggles() {
    if (window.__fbcleanClosedByUser) return;
    const skipList = parseSkipList(currentSettings.skipUsernames);
    const threads = findFBInboxThreadItems();

    for (const threadEl of threads) {
      const { title } = getFBThreadIdentity(threadEl);
      const normTitle = title.toLowerCase().trim();
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
          await toggleKeepConversationName(title);
        });
        threadEl.appendChild(toggleBtn);
      }

      toggleBtn.classList.toggle('instaclean-is-kept', isKept);
      toggleBtn.textContent = isKept ? '🛡️ Keep' : '🗑️ Clean';
    }

    renderKeepChecklistInWidget();
  }

  // Find the 3-dots "More / Menu" button on a Facebook chat row
  function findRowMoreMenuButton(threadRow) {
    const rowRect = threadRow.getBoundingClientRect();
    const { title } = getFBThreadIdentity(threadRow);
    const selectors = [
      '[aria-label*="के लिए अन्य विकल्प"]',
      '[aria-label*="More options for" i]',
      '[aria-label*="Menu" i]',
      '[aria-label*="More" i]',
      '[aria-label*="more options" i]',
      '[aria-label*="विकल्प" i]',
      '[aria-haspopup="menu"]'
    ];

    for (const sel of selectors) {
      const inside = threadRow.querySelectorAll(sel);
      for (const node of inside) {
        if (node.classList.contains('instaclean-row-toggle')) continue;
        const btn = node.closest('[role="button"], button, [tabindex="0"]') || node;
        if (btn && btn.getBoundingClientRect().width > 0) {
          return btn;
        }
      }
    }

    // Match by exact chat title in aria-label or by vertical alignment with the row
    for (const sel of selectors) {
      for (const node of document.querySelectorAll(sel)) {
        if (node.classList.contains('instaclean-row-toggle')) continue;
        const aria = (node.getAttribute('aria-label') || '').toLowerCase();
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (title && title.length > 2 && aria.includes(title.toLowerCase())) {
          return node.closest('[role="button"], button, [tabindex="0"]') || node;
        }
        if (
          r.left < 460 &&
          r.top >= rowRect.top - 12 &&
          r.bottom <= rowRect.bottom + 12 &&
          r.width <= 64
        ) {
          return node.closest('[role="button"], button, [tabindex="0"]') || node;
        }
      }
    }
    return null;
  }

  function findDeleteChatOption() {
    const rx = /^(delete chat|delete conversation|delete thread|delete|चैट डिलीट करें|चैट हटाएं|बातचीत हटाएं|डिलीट करें)$/i;
    // First look specifically inside open [role="menu"] popups
    const menuItems = document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menuitem"]');
    for (const item of menuItems) {
      if (!isVisible(item)) continue;
      const text = (item.innerText || item.textContent || '').trim();
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (rx.test(text) || lines.some((l) => rx.test(l))) {
        return item;
      }
    }
    return findClickableByText([rx]);
  }

  function findDialogConfirmDeleteButton() {
    const rx = /^(delete chat|delete conversation|delete|remove|unsend|चैट डिलीट करें|डिलीट करें|हटाएं)$/i;
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const buttons = Array.from(dialog.querySelectorAll('[role="button"], button')).filter((btn) => {
        if (!isVisible(btn) || btn.getAttribute('aria-disabled') === 'true') return false;
        const r = btn.getBoundingClientRect();
        return r.width >= 45 && r.height >= 24;
      });
      // Prefer button with visible matching text (e.g. "चैट डिलीट करें" / "Delete chat")
      const withText = buttons.reverse().find((btn) => {
        const text = (btn.innerText || btn.textContent || '').trim();
        return rx.test(text);
      });
      if (withText) return withText;

      const withAria = buttons.find((btn) => {
        const aria = (btn.getAttribute('aria-label') || '').trim();
        return rx.test(aria);
      });
      if (withAria) return withAria;
    }
    return null;
  }

  // Delete a Facebook conversation via Fast Row Menu (...) OR Right-Side Chat Info Drawer
  async function deleteFBThread(threadEl) {
    // Method 1 (Fastest): Hover the thread row in the left sidebar and click its "..." Menu button
    simulateHover(threadEl);
    const linkInside = threadEl.querySelector('a, [role="link"], [role="gridcell"]');
    if (linkInside) simulateHover(linkInside);
    await sleep(320);

    const rowMenuBtn = await waitForElement(() => findRowMoreMenuButton(threadEl), 1100, 140);
    if (rowMenuBtn) {
      await updateJobState({ currentAction: 'Opening chat (...) menu...' });
      simulateClick(rowMenuBtn);
      await sleep(420);

      const menuDeleteOpt = await waitForElement(findDeleteChatOption, 1500, 150);
      if (menuDeleteOpt) {
        await updateJobState({ currentAction: 'Clicking "Delete chat"...' });
        simulateClick(menuDeleteOpt);
        await sleep(480);

        const confirmBtn = await waitForElement(findDialogConfirmDeleteButton, 2400, 150);
        if (confirmBtn) {
          await highlightElementsBatch([confirmBtn], true);
          await updateJobState({ currentAction: 'Confirming permanent deletion...' });
          simulateClick(confirmBtn);
          await sleep(850);
          return { ok: true };
        }
      } else {
        // Close menu if Delete chat wasn't in it
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
      }
    }

    // Method 2 (Fallback): Click the chat row to open it, then delete via Right-Side Chat Info Drawer
    const clickTarget =
      threadEl.querySelector('a[href*="/messages/"], a[href*="/t/"]') || threadEl;
    simulateClick(clickTarget, 0.52);
    await sleep(1100);

    let deleteChatBtn = findDeleteChatOption();

    // Check if "Privacy & support" section needs to be expanded in the right drawer
    if (!deleteChatBtn) {
      const privacyAccordion = findClickableByText([
        /^(privacy & support|privacy and support|गोपनीयता और सहायता)$/i
      ]);
      if (privacyAccordion) {
        simulateClick(privacyAccordion);
        await sleep(500);
        deleteChatBtn = await waitForElement(findDeleteChatOption, 1400, 150);
      }
    }

    // If right drawer isn't open yet, click the Conversation Information (i) button in top-right header
    if (!deleteChatBtn) {
      const infoBtn = document.querySelector(
        '[aria-label*="Conversation information" i], [aria-label*="Chat info" i], [aria-label*="जानकारी" i]'
      );
      if (infoBtn && isVisible(infoBtn)) {
        simulateClick(infoBtn);
        await sleep(750);
        const privacyAccordion = findClickableByText([
          /^(privacy & support|privacy and support|गोपनीयता और सहायता)$/i
        ]);
        if (privacyAccordion) {
          simulateClick(privacyAccordion);
          await sleep(500);
        }
        deleteChatBtn = await waitForElement(findDeleteChatOption, 1800, 160);
      }
    }

    if (!deleteChatBtn) {
      return { ok: false, reason: 'Could not find "Delete chat" menu or button' };
    }

    await highlightElementsBatch([deleteChatBtn], true);
    await updateJobState({ currentAction: 'Clicking "Delete chat"...' });
    simulateClick(deleteChatBtn);
    await sleep(500);

    const confirmBtn = await waitForElement(findDialogConfirmDeleteButton, 2500, 160);
    if (!confirmBtn) {
      await highlightElementsBatch([deleteChatBtn], false);
      return { ok: false, reason: 'Confirmation dialog did not appear' };
    }

    await highlightElementsBatch([confirmBtn], true);
    await updateJobState({ currentAction: 'Confirming permanent deletion...' });
    simulateClick(confirmBtn);
    await sleep(900);
    return { ok: true };
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
        currentAction: 'Resuming Facebook chat cleanup...'
      });
    }
  }

  async function runDeleteFBChatsLoop() {
    const maxLimit = Number(currentSettings.maxItems) || 0;
    let consecutiveScrollsWithoutThreads = 0;
    const maxInboxScrolls = 20;

    if (
      window.location.hostname.includes('facebook.com') &&
      !window.location.pathname.startsWith('/messages')
    ) {
      await updateJobState({
        currentAction: 'Redirecting to Facebook Messages (/messages/)...',
        logEntry: 'Navigating to facebook.com/messages/'
      });
      await chrome.storage.local.set({ pendingAutoStart: true });
      window.location.href = 'https://www.facebook.com/messages/';
      return;
    }

    await updateJobState({
      currentAction: 'Scanning Facebook Messenger conversations...',
      logEntry: 'Started Facebook Messenger chat cleaner'
    });

    const initialScroller = findFBInboxScrollContainer();
    if (initialScroller && initialScroller.scrollTop > 100) {
      await scrollFBInboxList(initialScroller, 'top');
    }

    await waitForElement(() => {
      const items = findFBInboxThreadItems();
      return items.length > 0 ? items : null;
    }, 5500, 300);

    while (!stopRequested) {
      await waitWhilePaused();
      if (stopRequested) break;

      const { jobState = {} } = await chrome.storage.local.get('jobState');
      const deletedSoFar = jobState.deletedCount || 0;
      if (maxLimit > 0 && deletedSoFar >= maxLimit) {
        await updateJobState({
          currentAction: `Completed! Reached target limit of ${maxLimit}.`,
          logEntry: `Finished after deleting ${deletedSoFar} Facebook chats.`
        });
        break;
      }

      const skipList = parseSkipList(currentSettings.skipUsernames);
      const allThreads = findFBInboxThreadItems().filter((el) => {
        const { key } = getFBThreadIdentity(el);
        return !skippedThreadKeys.has(key);
      });

      if (allThreads.length === 0) {
        if (currentSettings.autoScroll && consecutiveScrollsWithoutThreads < maxInboxScrolls) {
          consecutiveScrollsWithoutThreads++;
          const scroller = findFBInboxScrollContainer();
          if (scroller) {
            const atBottom =
              scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 25;
            if (atBottom && scroller.scrollTop > 80 && consecutiveScrollsWithoutThreads > 3) {
              await updateJobState({
                currentAction: 'Reached bottom — scrolling back to top of Facebook chats...'
              });
              await scrollFBInboxList(scroller, 'top');
              continue;
            }

            await updateJobState({
              currentAction: `Scrolling Facebook chats down (${consecutiveScrollsWithoutThreads}/${maxInboxScrolls})...`
            });
            await scrollFBInboxList(scroller, 'down');
            continue;
          }
        }

        await updateJobState({
          currentAction: 'All Facebook Messenger conversations processed!',
          logEntry: 'All visible & scrollable Facebook chats processed.'
        });
        break;
      }

      consecutiveScrollsWithoutThreads = 0;
      const threadEl = allThreads[0];
      const { key: threadKey, title: threadSummary } = getFBThreadIdentity(threadEl);

      const shouldSkip = skipList.some((u) => threadSummary.toLowerCase().includes(u));
      if (shouldSkip) {
        skippedThreadKeys.add(threadKey);
        const st = await chrome.storage.local.get('jobState');
        await updateJobState({
          skippedCount: (st.jobState?.skippedCount || 0) + 1,
          currentAction: `Skipped protected chat: ${threadSummary}`,
          logEntry: `Skipped protected chat "${threadSummary}"`
        });
        if (allThreads.length <= 1) {
          const scroller = findFBInboxScrollContainer();
          if (scroller) await scrollFBInboxList(scroller, 'down');
        } else {
          await sleep(250);
        }
        continue;
      }

      await highlightElementsBatch([threadEl], true);
      await updateJobState({
        currentAction: `Deleting Facebook chat: "${threadSummary.slice(0, 26)}"...`
      });

      const deleteResult = await deleteFBThread(threadEl);
      await highlightElementsBatch([threadEl], false);

      if (deleteResult.ok) {
        const st = await chrome.storage.local.get('jobState');
        const nextDeleted = (st.jobState?.deletedCount || 0) + 1;
        await updateJobState({
          deletedCount: nextDeleted,
          currentAction: `Deleted "${threadSummary.slice(0, 22)}" (Total: ${nextDeleted})`,
          logEntry: `Deleted FB chat "${threadSummary.slice(0, 26)}"`,
          historyItem: { type: 'fb_chat_deleted', title: threadSummary }
        });

        if (allThreads.length <= 4 && currentSettings.autoScroll) {
          await triggerFBInboxPaginationLoad();
        }

        if (
          currentSettings.batchCooldown &&
          nextDeleted > 0 &&
          nextDeleted % Math.max(5, Number(currentSettings.batchSize) || 20) === 0
        ) {
          const waitSecs = Math.max(5, Number(currentSettings.cooldownSeconds) || 20);
          await runCooldownCountdown(waitSecs, `Batch safety pause (${nextDeleted} cleaned)`);
        }
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
      if (isPaused) resumeAutomation();
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

    await chrome.storage.local.set({ pendingAutoStart: true });
    await updateJobState({
      status: 'running',
      currentAction: 'Starting Facebook Messenger cleaner...',
      logEntry: 'Facebook chat deletion started'
    });

    try {
      await runDeleteFBChatsLoop();
    } catch (err) {
      console.error('FBClean execution error:', err);
      const st = await chrome.storage.local.get('jobState');
      await updateJobState({
        errorCount: (st.jobState?.errorCount || 0) + 1,
        currentAction: `Error: ${err?.message || 'Automation interrupted'}`
      });
    } finally {
      const wasStopped = stopRequested;
      isRunning = false;
      isPaused = false;
      stopRequested = false;
      await chrome.storage.local.set({ pendingAutoStart: false });
      await updateJobState({
        status: 'idle',
        currentAction: wasStopped ? 'Stopped by user.' : 'Finished cleaning Facebook chats!',
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
      currentAction: '▶ Resumed Facebook deletion...',
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
    header.style.background =
      'linear-gradient(90deg, rgba(0, 132, 255, 0.32), rgba(0, 198, 255, 0.22))';

    const brand = document.createElement('div');
    brand.className = 'instaclean-brand';

    const dot = document.createElement('span');
    dot.className = 'instaclean-dot';
    dot.id = 'instaclean-live-dot';

    const title = document.createElement('span');
    title.textContent = 'FBClean — Messenger Deleter';

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
    reopenPill.textContent = '🧹 Open FBClean';
    reopenPill.title = 'Click to reopen FBClean panel';

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
      window.__fbcleanClosedByUser = true;
      widget.style.display = 'none';
      reopenPill.style.display = 'flex';
      document.querySelectorAll('.instaclean-row-toggle').forEach((el) => el.remove());
      document
        .querySelectorAll('.instaclean-row-protected')
        .forEach((el) => el.classList.remove('instaclean-row-protected'));
    });

    reopenPill.addEventListener('click', () => {
      window.__fbcleanClosedByUser = false;
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

    // Keep Conversations Manager section inside floating widget
    const keepBox = document.createElement('div');
    keepBox.className = 'instaclean-keep-box';

    const keepHeader = document.createElement('div');
    keepHeader.className = 'instaclean-keep-header';

    const keepTitle = document.createElement('div');
    keepTitle.className = 'instaclean-keep-title';
    keepTitle.id = 'instaclean-keep-title-count';
    keepTitle.textContent = '🛡️ Keep Conversations (0 Kept)';

    const scanBtn = document.createElement('button');
    scanBtn.type = 'button';
    scanBtn.className = 'instaclean-keep-scan-btn';
    scanBtn.textContent = '🔄 Scan List';
    scanBtn.addEventListener('click', () => {
      syncRowProtectionToggles();
    });

    keepHeader.append(keepTitle, scanBtn);

    const keepInputRow = document.createElement('div');
    keepInputRow.className = 'instaclean-keep-input-row';

    const keepInput = document.createElement('input');
    keepInput.type = 'text';
    keepInput.className = 'instaclean-keep-input';
    keepInput.placeholder = 'Enter name to KEEP safe...';

    const keepAddBtn = document.createElement('button');
    keepAddBtn.type = 'button';
    keepAddBtn.className = 'instaclean-keep-add-btn';
    keepAddBtn.textContent = '+ Keep';

    const addFromInput = async () => {
      const val = keepInput.value.trim();
      if (!val) return;
      keepInput.value = '';
      await toggleKeepConversationName(val, true);
    };

    keepAddBtn.addEventListener('click', addFromInput);
    keepInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFromInput();
      }
    });

    keepInputRow.append(keepInput, keepAddBtn);

    const keepList = document.createElement('div');
    keepList.className = 'instaclean-keep-list';
    keepList.id = 'instaclean-keep-checklist';

    keepBox.append(keepHeader, keepInputRow, keepList);

    const statusBox = document.createElement('div');
    statusBox.className = 'instaclean-status-box';
    statusBox.id = 'instaclean-widget-status';
    statusBox.textContent = 'Ready. Tick chats in 🛡️ Keep Conversations above to protect them!';

    const actions = document.createElement('div');
    actions.className = 'instaclean-actions';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'instaclean-btn instaclean-btn-start';
    startBtn.style.background = 'linear-gradient(90deg, #0084ff, #00c6ff)';
    startBtn.id = 'instaclean-widget-start';
    startBtn.textContent = '▶ Delete All FB Chats';

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
      startAutomation({ mode: 'delete_chats' });
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
    body.append(statsRow, keepBox, statusBox, actions);
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
      renderFloatingWidgetState(jobState);
      syncRowProtectionToggles();

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
