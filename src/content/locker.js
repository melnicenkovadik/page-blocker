const OVERLAY_ID = "__page_lock_overlay";
const LISTENER_OPTIONS = { capture: true, passive: false };

const EVENT_TYPES = [
  "click",
  "dblclick",
  "contextmenu",
  "auxclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "wheel",
  "touchstart",
  "touchmove",
  "touchend",
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
];

let enabled = false;
let overlay = null;

const blocker = (event) => {
  if (!enabled) return;

  if (event.cancelable) {
    event.preventDefault();
  }
  event.stopImmediatePropagation();
};

const addListeners = () => {
  EVENT_TYPES.forEach((type) => {
    window.addEventListener(type, blocker, LISTENER_OPTIONS);
    document.addEventListener(type, blocker, LISTENER_OPTIONS);
  });
};

const removeListeners = () => {
  EVENT_TYPES.forEach((type) => {
    window.removeEventListener(type, blocker, LISTENER_OPTIONS);
    document.removeEventListener(type, blocker, LISTENER_OPTIONS);
  });
};

const ensureOverlay = () => {
  if (overlay) return;
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    overlay = existing;
    return;
  }

  const root = document.documentElement || document.body;
  if (!root) {
    setTimeout(ensureOverlay, 50);
    return;
  }

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "transparent",
    pointerEvents: "all",
    touchAction: "none",
    userSelect: "none",
  });

  root.appendChild(overlay);
};

const removeOverlay = () => {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
};

const enable = () => {
  if (enabled) return;
  enabled = true;
  addListeners();
  ensureOverlay();
};

const disable = () => {
  if (!enabled) return;
  enabled = false;
  removeListeners();
  removeOverlay();
};

const syncInitialState = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "LOCK_GET_STATE",
    });
    if (response?.locked) {
      enable();
    }
  } catch (error) {
    // Ignore connection errors on startup.
  }
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "LOCK_ENABLE") enable();
  if (message?.type === "LOCK_DISABLE") disable();
});

syncInitialState();
