import type { ExtensionMessage } from "../shared/messages";

chrome.runtime.onInstalled.addListener(() => {
  // Clicking the toolbar icon opens the side panel directly — there is no
  // popup in this extension (a popup auto-closes the instant the user
  // clicks the host page, which would break "Select from Page").
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error("Failed to set side panel behavior:", err);
  });
});

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab to inject into.");
  return tab.id;
}

// Note: PICKED_TEXT / PICKER_CANCELLED need no handling here. The content
// script sends them via chrome.runtime.sendMessage, which Chrome already
// broadcasts to every extension context (background, side panel, popup,
// options page) — the side panel's own onMessage listener in App.tsx
// receives them directly. An earlier version of this file relayed them
// through here too, which delivered every pick event to the side panel
// twice.
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "START_PICKER") {
    (async () => {
      try {
        const tabId = await getActiveTabId();
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content/picker.js"],
        });
        await chrome.tabs.sendMessage(tabId, { type: "BEGIN_PICK", field: message.field });
        sendResponse({ ok: true });
      } catch (err) {
        console.error("[background] START_PICKER failed:", err);
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // keep the message channel open for the async response
  }

  return undefined;
});
