const SETTINGS_URL = "https://www.linkedin.com/mypreferences/d/profile-viewing-options";

const statusEl = document.getElementById("status");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const openOnlyButton = document.getElementById("open-only");
const gearButton = document.getElementById("gear");
const settingsPanel = document.getElementById("settings");
const applyModeInputs = Array.from(document.querySelectorAll('input[name="apply-mode"]'));

// Preference: how to apply a change — "background" (default) or "page".
chrome.storage.local.get("openInPage").then(({ openInPage }) => {
  const value = openInPage ? "page" : "background";
  applyModeInputs.forEach((input) => {
    input.checked = input.value === value;
  });
});
applyModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      chrome.storage.local.set({ openInPage: input.value === "page" });
    }
  });
});

function openInPageSelected() {
  return applyModeInputs.some((input) => input.checked && input.value === "page");
}

// Toggle the settings popover, and close it on outside click / Escape.
function setPanel(open) {
  settingsPanel.hidden = !open;
  gearButton.setAttribute("aria-expanded", String(open));
}
gearButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setPanel(settingsPanel.hidden);
});
document.addEventListener("click", (event) => {
  if (!settingsPanel.hidden && !settingsPanel.contains(event.target) && event.target !== gearButton) {
    setPanel(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsPanel.hidden) {
    setPanel(false);
  }
});

// Reflect the currently-active mode when the popup opens, and keep it in sync
// if the content script detects a change while the popup is open.
highlightActiveMode();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.currentMode) {
    highlightActiveMode();
  }
});

async function highlightActiveMode() {
  const { currentMode } = await chrome.storage.local.get("currentMode");
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === currentMode);
  });
}

modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.mode;
    // Optimistically mark this mode active in the popup.
    modeButtons.forEach((b) => b.classList.toggle("is-active", b === button));
    const openInPage = openInPageSelected();
    const busyMsg = openInPage ? "Opening LinkedIn…" : "Updating your visibility…";
    await withBusyState(busyMsg, async () => {
      const response = await chrome.runtime.sendMessage({ type: "open-and-select", mode, openInPage });
      if (!response?.ok) {
        throw new Error(response?.error || "Could not update your visibility.");
      }
      if (response.applied) {
        setStatus("Visibility updated.", "success");
      } else if (openInPage) {
        setStatus("Opened LinkedIn's settings page.", "success");
      } else {
        setStatus("Opened LinkedIn — please sign in and try again.", "error");
      }
    });
    if (openInPage) {
      window.close();
    }
  });
});

openOnlyButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(["pendingMode", "pendingModeSetAt"]);
  await chrome.tabs.create({ url: SETTINGS_URL, active: true });
  window.close();
});

async function withBusyState(message, action) {
  setButtonsDisabled(true);
  setStatus(message);

  try {
    await action();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  [...modeButtons, openOnlyButton].forEach((button) => {
    button.disabled = disabled;
  });
}

function setStatus(message, kind = "") {
  statusEl.className = kind;
  statusEl.textContent = message;
}
