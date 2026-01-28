import { useEffect, useRef, useState } from "react";

const getCurrentWindowId = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.windowId ?? null;
};

const getLockedForWindow = async (windowId) => {
  const response = await chrome.runtime.sendMessage({
    type: "LOCK_GET_STATE",
    windowId,
  });
  return Boolean(response?.locked);
};

const setLocked = async (locked) => {
  const windowId = await getCurrentWindowId();

  await chrome.runtime.sendMessage({
    type: "LOCK_SET",
    locked,
    windowId,
  });
};

export default function App() {
  const [locked, setLockedState] = useState(false);
  const [loading, setLoading] = useState(true);
  const windowIdRef = useRef(null);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const windowId = await getCurrentWindowId();
      if (!active) return;
      windowIdRef.current = windowId;
      const nextLocked = await getLockedForWindow(windowId);
      if (!active) return;
      setLockedState(nextLocked);
      setLoading(false);
    };

    init();

    const handleChange = (changes, area) => {
      if (area !== "local" || !changes.lockState) return;
      const windowId = windowIdRef.current;
      const nextState = changes.lockState.newValue;
      const nextLocked =
        Boolean(nextState?.locked) &&
        Number.isInteger(windowId) &&
        nextState?.windowId === windowId;
      setLockedState(nextLocked);
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleChange);
    };
  }, []);

  const handleToggle = async (event) => {
    const nextLocked = event.target.checked;
    setLockedState(nextLocked);
    await setLocked(nextLocked);
  };

  return (
    <div className="popup">
      <div className="title">Page Lock</div>
      <div className="row">
        <label className={`switch ${locked ? "is-on" : ""}`}>
          <input
            type="checkbox"
            checked={locked}
            onChange={handleToggle}
            disabled={loading}
          />
          <span className="slider" />
        </label>
        <span className="status">{locked ? "Locked" : "Unlocked"}</span>
      </div>
      <div className="hint">Applies to all tabs in this window.</div>
    </div>
  );
}
