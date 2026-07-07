const MODE_LABELS = {
  name: "Your name and headline",
  characteristics: "Private profile characteristics",
  private: "Private mode"
};

const PENDING_MAX_AGE_MS = 2 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "select-mode") {
    return false;
  }

  selectMode(message.mode)
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});

bootPendingSelection();
initModeReporting();

// Watches LinkedIn's page and tells the background which option is checked,
// so the toolbar icon always mirrors the real setting — including changes the
// user makes directly on the page.
function initModeReporting() {
  let lastReported = null;
  let timer = null;

  const report = () => {
    const mode = detectCheckedMode();
    if (mode && mode !== lastReported) {
      lastReported = mode;
      chrome.runtime.sendMessage({ type: "mode-detected", mode }, () => {
        chrome.runtime.lastError;
      });
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(report, 300);
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["checked", "aria-checked", "class"]
  });
}

function detectCheckedMode() {
  for (const [mode, labelText] of Object.entries(MODE_LABELS)) {
    if (isOptionChecked(labelText)) {
      return mode;
    }
  }
  return null;
}

function isOptionChecked(labelText) {
  const input = findInputForOption(labelText);
  if (input instanceof HTMLInputElement) {
    return input.checked;
  }
  return input?.getAttribute("aria-checked") === "true";
}

async function bootPendingSelection() {
  const { pendingMode, pendingModeSetAt } = await chrome.storage.local.get([
    "pendingMode",
    "pendingModeSetAt"
  ]);

  if (!pendingMode || Date.now() - Number(pendingModeSetAt || 0) > PENDING_MAX_AGE_MS) {
    return;
  }

  const result = await selectMode(pendingMode).catch((error) => ({
    ok: false,
    error: error.message || String(error)
  }));

  if (result.ok) {
    await chrome.storage.local.remove(["pendingMode", "pendingModeSetAt"]);
  }
}

async function selectMode(mode) {
  const labelText = MODE_LABELS[mode];
  if (!labelText) {
    throw new Error("Unknown visibility mode.");
  }

  const target = await waitForOption(labelText);
  target.click();

  await waitForChecked(labelText);
  await chrome.storage.local.remove(["pendingMode", "pendingModeSetAt"]);

  // Tell the background the option is now checked so it can close the
  // hidden tab and confirm to the popup.
  chrome.runtime.sendMessage({ type: "selection-complete", mode }, () => {
    chrome.runtime.lastError;
  });

  return { ok: true, mode, label: labelText };
}

function waitForOption(labelText) {
  return waitUntil(() => findClickableOption(labelText), 20000, 100);
}

function waitForChecked(labelText) {
  return waitUntil(() => {
    const input = findInputForOption(labelText);
    if (input instanceof HTMLInputElement) {
      return input.checked ? input : null;
    }

    if (input?.getAttribute("aria-checked") === "true") {
      return input;
    }

    return null;
  }, 5000, 100);
}

function findClickableOption(labelText) {
  const input = findInputForOption(labelText);
  if (input) {
    return input;
  }

  const textNode = findTextNode(labelText);
  if (!textNode) {
    return null;
  }

  return (
    textNode.parentElement?.closest("label") ||
    textNode.parentElement?.closest("button") ||
    textNode.parentElement?.closest("[role='radio']") ||
    textNode.parentElement
  );
}

function findInputForOption(labelText) {
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find((candidate) => normalize(candidate.textContent).includes(normalize(labelText)));
  const nestedInput = label?.querySelector("input[type='radio']");
  if (nestedInput) {
    return nestedInput;
  }

  if (label?.htmlFor) {
    const input = document.getElementById(label.htmlFor);
    if (input instanceof HTMLInputElement && input.type === "radio") {
      return input;
    }
  }

  const textNode = findTextNode(labelText);
  const row = textNode?.parentElement?.closest("li, div, section, fieldset");
  const rowInput = row?.querySelector("input[type='radio']");
  if (rowInput) {
    return rowInput;
  }

  const radio = textNode?.parentElement?.closest("[role='radio']");
  return radio || null;
}

function findTextNode(text) {
  const normalizedNeedle = normalize(text);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (normalize(node.textContent).includes(normalizedNeedle)) {
      return node;
    }
    node = walker.nextNode();
  }

  return null;
}

function waitUntil(getValue, timeoutMs, intervalMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const value = getValue();
      if (value) {
        resolve(value);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Could not find the LinkedIn visibility option on the page."));
        return;
      }

      setTimeout(tick, intervalMs);
    };

    tick();
  });
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}
