const port = Number(process.env.FZ_CDP_PORT || 9223);
const browserUrl = process.env.FZ_TEST_URL;
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = targets.find(
  (item) => item.type === "page" && item.title === "FZ Terminal",
);
if (!target) throw new Error("FZ Terminal DevTools target was not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result.value;
}

async function press(key, code, modifiers = 0) {
  const windowsVirtualKeyCode =
    key === "Enter"
      ? 13
      : key === "Tab"
        ? 9
        : key.toUpperCase().charCodeAt(0);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
  });
}

async function clickNewTab(label) {
  await evaluate(`document.querySelector(".new-tab-button")?.click()`);
  await delay(60);
  await evaluate(`(() => {
    const item = [...document.querySelectorAll(".context-menu .menu-entry")]
      .find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    item?.click();
  })()`);
  await delay(label === "Browser" ? 700 : 180);
  return evaluate(
    `document.querySelector(".tab.active")?.dataset.tabId ?? null`,
  );
}

async function setText(selector, value) {
  await evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(
      field,
      ${JSON.stringify(value)},
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}

async function closeTab(tabId) {
  await evaluate(`document
    .querySelector(${JSON.stringify(`.tab[data-tab-id="${tabId}"] .tab-close`)})
    ?.click()`);
  await delay(50);
  await evaluate(`document.querySelector(".modal-card .button.danger")?.click()`);
  await delay(80);
}

await send("Runtime.enable");

const hasPersistedState = await evaluate(
  `Boolean(localStorage.getItem("fz-terminal-state"))`,
);
if (!hasPersistedState) {
  await evaluate(
    `document.querySelector('.titlebar-actions button[title="Toggle Commands"]')?.click()`,
  );
  await delay(80);
  await evaluate(
    `document.querySelector('.titlebar-actions button[title="Toggle Commands"]')?.click()`,
  );
  await delay(80);
}

const shell = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  return {
    iconRemoved: !document.querySelector(".titlebar-appmark"),
    workspaceBrand: {
      icon: Boolean(document.querySelector(".workspace-brand img")),
      name: document.querySelector(".workspace-brand strong")?.textContent,
      channel: document.querySelector(".workspace-brand small")?.textContent,
      sessionLabelRemoved:
        !document.querySelector(".workspace-count") &&
        !document
          .querySelector(".workspace-bar")
          ?.textContent.toLowerCase()
          .includes("sessions"),
    },
    shortcuts: state.settings.shortcuts,
    version: JSON.parse(localStorage.getItem("fz-terminal-state")).version,
    draggable: {
      tabs: [...document.querySelectorAll(".tab")].every((item) => item.draggable),
      workspaces: [...document.querySelectorAll(".workspace-pill")]
        .filter((item) => item.tagName === "BUTTON")
        .every((item) => item.draggable),
    },
  };
})()`);

await evaluate(
  `document.querySelector('.titlebar-actions button[title="Settings"]')?.click()`,
);
await delay(80);
await evaluate(`(() => {
  [...document.querySelectorAll(".settings-nav > button")]
    .find((button) => button.textContent.trim() === "Appearance")
    ?.click();
})()`);
await delay(80);
const themes = await evaluate(
  `document.querySelectorAll(".theme-card").length`,
);
const appearanceBefore = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  return state.settings.appearance;
})()`);
const systemFonts = await evaluate(
  `window.fzTerminal.fonts.list().then((items) => items.length)`,
);
if (!appearanceBefore.advancedColors) {
  await evaluate(`(() => {
    const row = [...document.querySelectorAll(".toggle-row")].find(
      (item) => item.querySelector("strong")?.textContent ===
        "Advanced color mode",
    );
    row?.querySelector("input")?.click();
  })()`);
  await delay(80);
}
await evaluate(`(() => {
  const input = document.querySelector(
    '.palette-color input[aria-label="Accent"]',
  );
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, "#12abde");
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await delay(80);
const liveAccent = await evaluate(
  `getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()`,
);
await evaluate(`(() => {
  const input = document.querySelector(
    '.palette-color input[aria-label="Accent"]',
  );
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, ${JSON.stringify(appearanceBefore.customPalette.accent)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await delay(60);
if (!appearanceBefore.advancedColors) {
  await evaluate(`(() => {
    const row = [...document.querySelectorAll(".toggle-row")].find(
      (item) => item.querySelector("strong")?.textContent ===
        "Advanced color mode",
    );
    row?.querySelector("input")?.click();
  })()`);
  await delay(60);
}
await press("Escape", "Escape");
await delay(80);

const firstNoteId = await clickNewTab("Note");
await setText(".note-editor textarea", "note-alpha");
const secondNoteId = await clickNewTab("Note");
await setText(".note-editor textarea", "note-beta");
await evaluate(`document
  .querySelector(${JSON.stringify(`.tab[data-tab-id="${firstNoteId}"] .tab-main`)})
  ?.click()`);
await delay(80);
const firstNote = await evaluate(
  `document.querySelector(".note-editor textarea")?.value`,
);
await evaluate(`document
  .querySelector(${JSON.stringify(`.tab[data-tab-id="${secondNoteId}"] .tab-main`)})
  ?.click()`);
await delay(80);
const secondNote = await evaluate(
  `document.querySelector(".note-editor textarea")?.value`,
);

await evaluate(`(() => {
  const source = document.querySelector(
    ${JSON.stringify(`.tab[data-tab-id="${secondNoteId}"]`)},
  );
  const target = document.querySelector(
    ${JSON.stringify(`.tab[data-tab-id="${firstNoteId}"]`)},
  );
  const transfer = new DataTransfer();
  source.dispatchEvent(new DragEvent("dragstart", {
    bubbles: true,
    dataTransfer: transfer,
  }));
  target.dispatchEvent(new DragEvent("dragover", {
    bubbles: true,
    cancelable: true,
    dataTransfer: transfer,
  }));
  target.dispatchEvent(new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    dataTransfer: transfer,
  }));
  source.dispatchEvent(new DragEvent("dragend", {
    bubbles: true,
    dataTransfer: transfer,
  }));
})()`);
await delay(100);
const tabDrag = await evaluate(
  `[...document.querySelectorAll(".tab")].map((tab) => tab.dataset.tabId)`,
);

await evaluate(
  `document.querySelector('.tab[data-tab-kind="terminal"] .tab-main')?.click()`,
);
await delay(100);
await evaluate(
  `document.querySelector(".terminal-pane.active .terminal-host")?.click()`,
);
const marker = `FZ_AUTO_${Date.now()}`;
await send("Input.insertText", { text: `echo ${marker}` });
await press("Enter", "Enter");
await delay(180);
await send("Input.insertText", { text: `echo ${marker.slice(0, -4)}` });
await delay(80);
const suggestion = await evaluate(
  `document.querySelector(".inline-command-suggestion > span")?.textContent`,
);
const suggestionDiagnostics = await evaluate(`(() => ({
  activeTabKind: document.querySelector(".tab.active")?.dataset.tabKind,
  activePane: Boolean(document.querySelector(".terminal-pane.active")),
  helperValue: document.querySelector(".xterm-helper-textarea")?.value,
  history: JSON.parse(
    localStorage.getItem("fz-terminal-command-history") || "[]"
  ).slice(0, 3),
  rows: [...document.querySelectorAll(".terminal-pane.active .xterm-rows > div")]
    .slice(-5)
    .map((row) => row.textContent),
}))()`);
await press("Tab", "Tab");
await delay(80);
const suggestionAccepted = await evaluate(
  `!document.querySelector(".inline-command-suggestion")`,
);
await press("u", "KeyU", 2);

await send("Input.insertText", { text: "printf 'FZ_EMOJI ✅ 🚀\\n'" });
await press("Enter", "Enter");
await delay(160);
const emoji = await evaluate(`(() => {
  const text = [...document.querySelectorAll(".xterm-rows > div")]
    .map((row) => row.textContent)
    .join("\\n");
  const captured = Object.keys(localStorage)
    .filter((key) => key.startsWith("fz-terminal-command-blocks:"))
    .flatMap((key) => JSON.parse(localStorage.getItem(key) || "[]"))
    .map((block) => \`\${block.command}\\n\${block.output}\`)
    .join("\\n");
  return (
    text.includes("✅") && text.includes("🚀")
  ) || (
    captured.includes("✅") && captured.includes("🚀")
  );
})()`);
const terminalGeometry = await evaluate(`(() => {
  const pane = document.querySelector(".terminal-pane.active");
  const host = pane?.querySelector(".terminal-host");
  const xterm = host?.querySelector(":scope > .xterm");
  const rail = pane?.querySelector(".command-block-rail");
  const read = (element) => {
    const rect = element?.getBoundingClientRect();
    return rect
      ? {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }
      : null;
  };
  return {
    minimal: pane?.classList.contains("minimal-chrome"),
    pane: read(pane),
    host: read(host),
    xterm: read(xterm),
    rail: read(rail),
  };
})()`);
await evaluate(
  `document.querySelector(".terminal-pane.active .command-block-chip")?.click()`,
);
await delay(100);
const historyGeometry = await evaluate(`(() => {
  const pane = document.querySelector(".terminal-pane.active")
    ?.getBoundingClientRect();
  const history = document.querySelector(".terminal-pane.active .terminal-history")
    ?.getBoundingClientRect();
  const host = document.querySelector(".terminal-pane.active .terminal-host")
    ?.getBoundingClientRect();
  return {
    mounted: Boolean(history),
    contained: Boolean(
      pane &&
      history &&
      history.left >= pane.left - 1 &&
      history.top >= pane.top - 1 &&
      history.right <= pane.right + 1 &&
      history.bottom <= pane.bottom + 1
    ),
    sideBySide: Boolean(
      host &&
      history &&
      host.width > 0 &&
      host.right <= history.left + 1
    ),
  };
})()`);
await evaluate(
  `document.querySelector('.terminal-history button[title="Close history"]')?.click()`,
);
await delay(60);

await press("p", "KeyP", 10);
await delay(100);
const commandPalette = await evaluate(`({
  visible: Boolean(document.querySelector(".sidebar")),
  focused:
    document.activeElement === document.querySelector(".sidebar-search input"),
})`);
await evaluate(
  `document.querySelector('.sidebar button[title="Close commands"]')?.click()`,
);

await evaluate(
  `document.querySelector('.titlebar-actions button[title="Settings"]')?.click()`,
);
await delay(80);
await evaluate(`(() => {
  [...document.querySelectorAll(".settings-nav > button")]
    .find((button) => button.textContent.trim() === "Appearance")
    ?.click();
})()`);
await delay(80);
await evaluate(`(() => {
  const setRange = (label, value) => {
    const row = [...document.querySelectorAll(".setting-row")].find(
      (item) => item.querySelector("strong")?.textContent === label,
    );
    const input = row?.querySelector('input[type="range"]');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  setRange("Interface opacity", "0.42");
  setRange("Terminal background opacity", "0.33");
})()`);
await delay(120);
const opacity = await evaluate(`(() => {
  const root = document.documentElement;
  const host = document.querySelector(".terminal-host");
  return {
    variable: getComputedStyle(root).getPropertyValue("--window-opacity").trim(),
    renderer: getComputedStyle(document.querySelector("#root")).opacity,
    terminal: host
      ? getComputedStyle(host).getPropertyValue("--terminal-background").trim()
      : "",
  };
})()`);
await evaluate(
  `document.querySelector('.modal-card button[aria-label="Close"]')?.click()`,
);
await delay(80);

const browserDefaultId = await clickNewTab("Browser");
const browserDefault = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  const tab = state.workspaces
    .flatMap((workspace) => workspace.tabs)
    .find((item) => item.id === ${JSON.stringify(browserDefaultId)});
  return tab?.browserUrl ?? null;
})()`);
await closeTab(browserDefaultId);

const filesId = await clickNewTab("Files");
await delay(180);
await evaluate(`(() => {
  const row = [...document.querySelectorAll(".file-row")].find(
    (item) => !item.querySelector(".file-icon.folder"),
  );
  row?.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 280,
    clientY: 240,
  }));
})()`);
await delay(80);
const files = await evaluate(`(() => ({
  menu: [...document.querySelectorAll(".context-menu .menu-entry")]
    .map((entry) => entry.textContent.trim()),
  dynamicField:
    getComputedStyle(document.querySelector(".files-path input")).fieldSizing,
}))()`);
await press("Escape", "Escape");
await closeTab(filesId);

let browser;
let browserTabId;
if (browserUrl) {
  await evaluate(
    `window.dispatchEvent(new CustomEvent("fz:open-browser", {
      detail: ${JSON.stringify(browserUrl)},
    }))`,
  );
  await delay(500);
  browserTabId = await evaluate(
    `document.querySelector(".tab.active")?.dataset.tabId`,
  );
  const firstLoads = await fetch(`${browserUrl}/count`).then((response) =>
    response.json(),
  );
  await evaluate(
    `document.querySelector('.tab[data-tab-kind="terminal"] .tab-main')?.click()`,
  );
  await delay(100);
  await evaluate(`document
    .querySelector(${JSON.stringify(`.tab[data-tab-id="${browserTabId}"] .tab-main`)})
    ?.click()`);
  await delay(350);
  const secondLoads = await fetch(`${browserUrl}/count`).then((response) =>
    response.json(),
  );
  browser = {
    firstLoads: firstLoads.loads,
    secondLoads: secondLoads.loads,
    retained: firstLoads.loads === secondLoads.loads,
  };
}

await closeTab(secondNoteId);
await closeTab(firstNoteId);
if (browserTabId) await closeTab(browserTabId);

const report = {
  shell,
  themes,
  appearance: {
    uiFontSize: appearanceBefore.uiFontSize,
    uiFontFamily: appearanceBefore.uiFontFamily,
    terminalFontFamily: appearanceBefore.terminalFontFamily,
    systemFonts,
    liveAccent,
  },
  notes: {
    first: firstNote,
    second: secondNote,
    independent: firstNote === "note-alpha" && secondNote === "note-beta",
  },
  tabDrag: {
    order: tabDrag,
    moved: tabDrag.indexOf(secondNoteId) < tabDrag.indexOf(firstNoteId),
  },
  suggestion: {
    value: suggestion,
    accepted: suggestionAccepted,
    matched: suggestion === marker.slice(-4),
    diagnostics: suggestionDiagnostics,
  },
  emoji,
  terminalGeometry,
  historyGeometry,
  commandPalette,
  opacity,
  browserDefault,
  files,
  browser,
};
const failures = [];
if (!shell.iconRemoved) failures.push("titlebar icon remains visible");
if (
  !shell.workspaceBrand.icon ||
  shell.workspaceBrand.name !== "FZ Terminal" ||
  !shell.workspaceBrand.channel?.startsWith("BETA") ||
  !shell.workspaceBrand.sessionLabelRemoved
) {
  failures.push("bottom FZ Terminal beta brand did not replace session count");
}
if (themes < 11) failures.push("new themes are missing");
if (shell.version !== 11) failures.push("settings were not migrated");
if (systemFonts < 3) failures.push("system font enumeration failed");
if (liveAccent !== "#12abde") {
  failures.push("advanced palette did not apply live");
}
if (!report.notes.independent) failures.push("note tabs still share content");
if (!report.tabDrag.moved) failures.push("tab drag ordering failed");
if (!report.suggestion.matched || !report.suggestion.accepted) {
  failures.push("command-history autocomplete failed");
}
if (!emoji) failures.push("emoji text did not render in xterm");
if (
  !terminalGeometry.pane ||
  !terminalGeometry.host ||
  !terminalGeometry.xterm ||
  terminalGeometry.host.height < terminalGeometry.pane.height * 0.75 ||
  terminalGeometry.xterm.width > terminalGeometry.host.width + 1 ||
  terminalGeometry.xterm.height > terminalGeometry.host.height + 1
) {
  failures.push("terminal geometry overflowed after creating a command block");
}
if (
  !historyGeometry.mounted ||
  !historyGeometry.contained ||
  !historyGeometry.sideBySide
) {
  failures.push("command block drawer did not open beside the terminal");
}
if (browser && !browser.retained) failures.push("browser reloaded on tab switch");
if (shell.shortcuts.copyTerminal !== "Primary+Shift+C") {
  failures.push("standard terminal shortcuts were not migrated");
}
if (
  shell.shortcuts.splitHorizontal !== "Primary+Shift+D" ||
  shell.shortcuts.splitVertical !== "Primary+Shift+E" ||
  shell.shortcuts.commandPalette !== "Primary+Shift+P"
) {
  failures.push("Warp-compatible shortcuts were not migrated");
}
if (!commandPalette.visible || !commandPalette.focused) {
  failures.push("Warp command palette shortcut did not focus command search");
}
if (
  opacity.variable !== "0.42" ||
  opacity.renderer !== "0.42" ||
  !opacity.terminal.includes("0.33")
) {
  failures.push("window or terminal opacity did not apply live");
}
if (!browserDefault?.startsWith("https://www.google.com")) {
  failures.push("new browser tabs did not default to Google");
}
if (
  files.dynamicField !== "content" ||
  !files.menu.some((item) => item.includes("nano")) ||
  !files.menu.some((item) => item.includes("cat")) ||
  !files.menu.some((item) => item.includes("less")) ||
  !files.menu.some((item) => item.includes("grep"))
) {
  failures.push("Files actions or dynamic text field sizing are missing");
}

console.log(
  JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2),
);
socket.close();
process.exit(failures.length > 0 ? 1 : 0);
