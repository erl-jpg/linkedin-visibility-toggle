const SETTINGS_URL = "https://www.linkedin.com/mypreferences/d/profile-viewing-options";

const VALID_MODES = ["name", "characteristics", "private"];
const APPLY_TIMEOUT_MS = 15000;

// Per-mode toolbar icons so the toolbar reflects the active visibility setting.
const ICONS = {
  name: iconSet("icon-name"),
  characteristics: iconSet("icon-characteristics"),
  private: iconSet("icon-private"),
  default: iconSet("icon")
};

function iconSet(stem) {
  return {
    16: `icons/${stem}16.png`,
    32: `icons/${stem}32.png`,
    48: `icons/${stem}48.png`,
    128: `icons/${stem}128.png`
  };
}

function setActionIcon(mode) {
  const path = ICONS[mode] || ICONS.default;
  chrome.action.setIcon({ path }, () => chrome.runtime.lastError);
}

async function restoreIcon() {
  const { currentMode } = await chrome.storage.local.get("currentMode");
  setActionIcon(VALID_MODES.includes(currentMode) ? currentMode : "default");
}

async function rememberMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    return;
  }
  await chrome.storage.local.set({ currentMode: mode });
  setActionIcon(mode);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
  restoreIcon();
});
chrome.runtime.onStartup.addListener(restoreIcon);
restoreIcon();

// Tabs we opened invisibly to apply a setting -> resolver waiting for the
// content script to confirm the option was checked.
const pendingApplies = new Map(); // tabId -> { resolve, timer }

function waitForApply(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingApplies.delete(tabId);
      resolve(false);
    }, APPLY_TIMEOUT_MS);
    pendingApplies.set(tabId, {
      resolve: () => {
        clearTimeout(timer);
        pendingApplies.delete(tabId);
        resolve(true);
      },
      timer
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  // Content script reports which option is actually checked on LinkedIn.
  if (message.type === "mode-detected" || message.type === "selection-complete") {
    rememberMode(message.mode);
    if (message.type === "selection-complete") {
      const tabId = sender.tab?.id;
      const waiter = tabId != null && pendingApplies.get(tabId);
      if (waiter) {
        waiter.resolve();
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "open-and-select") {
    applyMode(message.mode, Boolean(message.openInPage))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  return false;
});

// Applies the chosen mode. Default (openInPage=false): the settings page does
// the work in a hidden background tab, closed on success — the user never
// leaves their page. When openInPage is true (the gear toggle), LinkedIn's
// settings page is opened in a visible tab and left open.
async function applyMode(mode, openInPage) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error("Unknown visibility mode.");
  }

  await chrome.storage.local.set({ pendingMode: mode, pendingModeSetAt: Date.now() });
  await rememberMode(mode); // optimistic; confirmed below

  const existing = (await chrome.tabs.query({ url: `${SETTINGS_URL}*` }))
    .find((tab) => tab.id != null);

  let tabId;
  let opened = false;
  if (existing) {
    tabId = existing.id;
    // Re-navigate in place so the content script re-runs; only steal focus
    // when the user asked to open the page.
    await chrome.tabs.update(tabId, { url: SETTINGS_URL, active: openInPage });
    if (openInPage && existing.windowId != null) {
      chrome.windows.update(existing.windowId, { focused: true }, () => chrome.runtime.lastError);
    }
  } else {
    const tab = await chrome.tabs.create({ url: SETTINGS_URL, active: openInPage });
    tabId = tab.id;
    opened = true;
  }

  const applied = await waitForApply(tabId);

  if (openInPage) {
    // Leave the visible tab open regardless of confirmation.
    return { ok: true, applied };
  }

  if (applied) {
    if (opened) {
      chrome.tabs.remove(tabId, () => chrome.runtime.lastError);
    }
    return { ok: true, applied: true };
  }

  // Couldn't confirm in the background — surface the tab so the user can finish.
  chrome.tabs.update(tabId, { active: true }, () => chrome.runtime.lastError);
  if (existing?.windowId != null) {
    chrome.windows.update(existing.windowId, { focused: true }, () => chrome.runtime.lastError);
  }
  return { ok: true, applied: false };
}
