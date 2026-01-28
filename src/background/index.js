const STORAGE_KEY = "lockState";
const DEFAULT_STATE = { locked: false, windowId: null };
const BADGE_TEXT = "ON";
const BADGE_COLOR = "#1a73e8";

const getState = async () => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? DEFAULT_STATE;
};

const setState = async (state) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return state;
};

const getWindowId = async (preferredWindowId) => {
  if (Number.isInteger(preferredWindowId)) {
    return preferredWindowId;
  }

  const lastFocused = await chrome.windows.getLastFocused({ populate: false });
  return lastFocused?.id ?? null;
};

const safeSendMessage = async (tabId, message) => {
  if (typeof tabId !== "number") return;

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Ignore tabs without content scripts (e.g. chrome:// pages).
  }
};

const setBadge = async (tabId, locked) => {
  if (typeof tabId !== "number") return;
  const text = locked ? BADGE_TEXT : "";

  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (locked) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: BADGE_COLOR,
      });
    }
  } catch (error) {
    // Ignore badge errors for unsupported tabs.
  }
};

const setBadgeForWindow = async (windowId, locked) => {
  if (windowId == null) return;
  const tabs = await chrome.tabs.query({ windowId });
  await Promise.all(tabs.map((tab) => setBadge(tab.id, locked)));
};

const broadcastToWindow = async (windowId, message) => {
  if (windowId == null) return;
  const tabs = await chrome.tabs.query({ windowId });
  await Promise.all(tabs.map((tab) => safeSendMessage(tab.id, message)));
};

const enableLock = async (windowId) => {
  const targetWindowId = await getWindowId(windowId);
  if (targetWindowId == null) return;

  const previousState = await getState();
  if (
    previousState.locked &&
    previousState.windowId != null &&
    previousState.windowId !== targetWindowId
  ) {
    await broadcastToWindow(previousState.windowId, { type: "LOCK_DISABLE" });
    await setBadgeForWindow(previousState.windowId, false);
  }

  await setState({ locked: true, windowId: targetWindowId });
  await broadcastToWindow(targetWindowId, { type: "LOCK_ENABLE" });
  await setBadgeForWindow(targetWindowId, true);
};

const disableLock = async () => {
  const state = await getState();
  await setState({ locked: false, windowId: null });

  if (state.windowId != null) {
    await broadcastToWindow(state.windowId, { type: "LOCK_DISABLE" });
    await setBadgeForWindow(state.windowId, false);
  }
};

const shouldLockTab = (state, tab) => {
  if (!state.locked) return false;
  if (!tab?.windowId) return false;
  return state.windowId === tab.windowId;
};

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  if (state.locked === undefined || state.windowId === undefined) {
    await setState(DEFAULT_STATE);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LOCK_GET_STATE") {
    getState().then((state) => {
      const messageWindowId = Number.isInteger(message.windowId)
        ? message.windowId
        : null;
      const lockedForSender = sender.tab
        ? shouldLockTab(state, sender.tab)
        : messageWindowId != null
          ? state.locked && state.windowId === messageWindowId
          : state.locked;
      sendResponse({ locked: lockedForSender, state });
    });
    return true;
  }

  if (message?.type === "LOCK_SET") {
    const locked = Boolean(message.locked);
    const targetWindowId = message.windowId;

    const action = locked ? enableLock(targetWindowId) : disableLock();
    action.then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-lock") return;
  const windowId = await getWindowId();
  if (windowId == null) return;

  const state = await getState();
  const shouldDisable = state.locked && state.windowId === windowId;
  if (shouldDisable) {
    await disableLock();
  } else {
    await enableLock(windowId);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const state = await getState();
  if (!shouldLockTab(state, tab)) {
    await setBadge(tabId, false);
    return;
  }

  await safeSendMessage(tabId, { type: "LOCK_ENABLE" });
  await setBadge(tabId, true);
});
