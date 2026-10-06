import type { BeginPickMessage, PickableField } from "../shared/messages";

const FIELD_LABELS: Record<PickableField, string> = {
  companyName: "Company Name",
  jobTitle: "Job Title",
  jobDescription: "Job Description",
};

const HIGHLIGHT_OUTLINE = "2px solid #1a73e8";
const BANNER_ID = "visa-checker-picker-banner";

interface PickerSession {
  field: PickableField;
  banner: HTMLDivElement;
  hoveredEl: HTMLElement | null;
  cleanup: () => void;
}

// Re-injection guard: chrome.scripting.executeScript may run this file again
// (e.g. the user clicks "Select from Page" a second time in the same tab).
// Tear down any previous session first so listeners/overlays don't stack up.
declare global {
  interface Window {
    __visaCheckerPickerSession?: PickerSession;
  }
}

function sendToBackground(message: unknown) {
  chrome.runtime.sendMessage(message);
}

function createBanner(field: PickableField): HTMLDivElement {
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.style.cssText = [
    "position:fixed",
    "top:12px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "background:#1a3a6b",
    "color:#fff",
    "font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "padding:10px 16px",
    "border-radius:8px",
    "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
    "display:flex",
    "align-items:center",
    "gap:12px",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = `Click or select text for "${FIELD_LABELS[field]}" — Esc to cancel`;
  banner.appendChild(label);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText =
    "background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:13px;";
  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cancelPicking();
  });
  banner.appendChild(cancelBtn);

  document.body.appendChild(banner);
  return banner;
}

function setHover(el: HTMLElement | null) {
  const session = window.__visaCheckerPickerSession;
  if (!session) return;
  if (session.hoveredEl && session.hoveredEl !== el) {
    session.hoveredEl.style.outline = "";
    session.hoveredEl.style.cursor = "";
  }
  if (el && el.id !== BANNER_ID && !el.closest(`#${BANNER_ID}`)) {
    el.style.outline = HIGHLIGHT_OUTLINE;
    el.style.cursor = "copy";
    session.hoveredEl = el;
  } else {
    session.hoveredEl = null;
  }
}

function onMouseOver(e: MouseEvent) {
  setHover(e.target as HTMLElement);
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest(`#${BANNER_ID}`)) return; // let the banner's own buttons work

  e.preventDefault();
  e.stopPropagation();

  const selectedText = window.getSelection()?.toString().trim();
  const text = selectedText && selectedText.length > 0 ? selectedText : (target.innerText ?? target.textContent ?? "").trim();

  const session = window.__visaCheckerPickerSession;
  if (!session) return;

  if (text.length > 0) {
    sendToBackground({ type: "PICKED_TEXT", field: session.field, text });
  } else {
    sendToBackground({ type: "PICKER_CANCELLED", field: session.field });
  }
  teardown();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    cancelPicking();
  }
}

function cancelPicking() {
  const session = window.__visaCheckerPickerSession;
  if (!session) return;
  sendToBackground({ type: "PICKER_CANCELLED", field: session.field });
  teardown();
}

function teardown() {
  const session = window.__visaCheckerPickerSession;
  if (!session) return;
  session.cleanup();
  window.__visaCheckerPickerSession = undefined;
}

function beginPicking(field: PickableField) {
  if (window.__visaCheckerPickerSession) {
    window.__visaCheckerPickerSession.cleanup();
  }

  const banner = createBanner(field);
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  const session: PickerSession = {
    field,
    banner,
    hoveredEl: null,
    cleanup: () => {
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      if (session.hoveredEl) {
        session.hoveredEl.style.outline = "";
        session.hoveredEl.style.cursor = "";
      }
      banner.remove();
    },
  };
  window.__visaCheckerPickerSession = session;
}

chrome.runtime.onMessage.addListener((message: BeginPickMessage) => {
  if (message.type === "BEGIN_PICK") {
    beginPicking(message.field);
  }
});
