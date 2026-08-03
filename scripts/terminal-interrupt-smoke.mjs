const port = Number(process.env.FZ_CDP_PORT || 9351);
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
    throw new Error(result.exceptionDetails.text || "Evaluation failed");
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMilliseconds = 2500) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await delay(50);
  }
  return false;
}

async function press(key, code, modifiers = 0, windowsVirtualKeyCode) {
  const keyCode =
    windowsVirtualKeyCode ??
    (key === "Enter" ? 13 : key.toUpperCase().charCodeAt(0));
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: keyCode,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: keyCode,
  });
}

await send("Runtime.enable");
await delay(450);
const sessionId = await evaluate(`(() => {
  const pane = document.querySelector(".terminal-pane.active");
  pane?.querySelector(".terminal-host")?.click();
  return pane?.dataset.sessionId;
})()`);
if (!sessionId) throw new Error("An active terminal session was not found");

const originalClipboard = await evaluate(
  `window.fzTerminal.clipboard.readText()`,
);

try {
const marker = `FZ_INTERRUPT_${Date.now()}`;
const historyCommand = `echo ${marker}`;
const historyPrefix = historyCommand.slice(0, -4);
await send("Input.insertText", { text: historyCommand });
await press("Enter", "Enter");
await delay(300);

await send("Input.insertText", { text: historyPrefix });
await delay(120);
const suggestionWhileDisabled = await evaluate(
  `Boolean(document.querySelector(".inline-command-suggestion"))`,
);
await evaluate(`(() => {
  window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "\\u0015");
  window.dispatchEvent(new CustomEvent("fz:clear-input", {
    detail: ${JSON.stringify(sessionId)},
  }));
})()`);

await evaluate(
  `document.querySelector('.titlebar-actions button[title="Settings"]')?.click()`,
);
await delay(320);
await evaluate(`(() => {
  [...document.querySelectorAll(".settings-nav > button")]
    .find((button) => button.textContent.trim() === "Terminal")
    ?.click();
})()`);
await delay(180);
const autocompleteSetting = await evaluate(`(() => {
  const rows = [...document.querySelectorAll(".toggle-row")];
  const autocomplete = rows.find(
    (row) => row.querySelector("strong")?.textContent ===
      "Command history autocomplete",
  )?.querySelector('input[type="checkbox"]');
  const copyOnSelect = rows.find(
    (row) => row.querySelector("strong")?.textContent ===
      "Copy text when selected",
  )?.querySelector('input[type="checkbox"]');
  const before = autocomplete?.checked;
  if (autocomplete && !autocomplete.checked) autocomplete.click();
  if (copyOnSelect?.checked) copyOnSelect.click();
  return {
    found: Boolean(autocomplete),
    before,
    after: autocomplete?.checked,
    copyOnSelectDisabled: copyOnSelect?.checked === false,
  };
})()`);
await evaluate(
  `document.querySelector('.modal-card button[aria-label="Close"]')?.click()`,
);
await delay(100);
await evaluate(
  `document.querySelector(".terminal-pane.active .xterm-helper-textarea")?.focus()`,
);
await waitFor(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy === false)`,
);
await send("Input.insertText", { text: historyPrefix });
const suggestionWhileIdle = await waitFor(
  `Boolean(document.querySelector(".inline-command-suggestion"))`,
  1500,
);
await evaluate(`(() => {
  window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "\\u0015");
  window.dispatchEvent(new CustomEvent("fz:clear-input", {
    detail: ${JSON.stringify(sessionId)},
  }));
})()`);

await send("Input.insertText", { text: "sleep 20" });
await press("Enter", "Enter");
await delay(350);
const busyBeforeInterrupt = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy)`,
);

const tabCountBeforeRecording = await evaluate(
  `document.querySelectorAll(".tab").length`,
);
await evaluate(
  `document.querySelector('.titlebar-actions button[title="Settings"]')?.click()`,
);
await delay(100);
await evaluate(`(() => {
  [...document.querySelectorAll(".settings-nav > button")]
    .find((button) => button.textContent.trim() === "Shortcuts")
    ?.click();
})()`);
await delay(80);
await evaluate(
  `document.querySelector('.shortcut-recorder[data-action="splitHorizontal"]')?.click()`,
);
await press("е", "KeyT", 10, 84);
await delay(120);
const tabCountAfterShortcut = await evaluate(
  `document.querySelectorAll(".tab").length`,
);
const newTabShortcutBlocked =
  tabCountAfterShortcut === tabCountBeforeRecording;
await evaluate(
  `document.querySelector('.shortcut-recorder[data-action="splitHorizontal"]')?.click()`,
);
// Recording Ctrl+C must not interrupt the foreground process.
await press("с", "KeyC", 2, 67);
await delay(200);
const shortcutRecording = await evaluate(`(() => {
  const recorder = document.querySelector(
    '.shortcut-recorder[data-action="splitHorizontal"]',
  );
  return {
    value: recorder?.textContent?.trim(),
    conflict: recorder?.getAttribute("aria-invalid") === "true",
    conflictRows: document.querySelectorAll(
      '.shortcut-recorder[aria-invalid="true"]',
    ).length,
    summary: document.querySelector(".shortcut-conflict-summary")?.textContent,
  };
})()`);
const busyAfterRecording = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy)`,
);
await evaluate(
  `document.querySelector('.modal-card button[aria-label="Close"]')?.click()`,
);
await delay(100);
await evaluate(
  `document.querySelector(".terminal-pane.active .xterm-helper-textarea")?.focus()`,
);

await send("Input.insertText", { text: historyPrefix });
await delay(120);
const suggestionWhileBusy = await evaluate(
  `Boolean(document.querySelector(".inline-command-suggestion"))`,
);

// Ctrl+C must use the physical KeyC even when the active layout emits Cyrillic с.
await press("с", "KeyC", 2, 67);
await delay(450);
const busyAfterInterrupt = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy)`,
);

// Clear any line-discipline input left from the suggestion probe.
await press("г", "KeyU", 2, 85);
const completionMarker = `${marker}_DONE`;
await send("Input.insertText", { text: `echo ${completionMarker}` });
await press("Enter", "Enter");
await delay(300);
const terminalResponsive = await evaluate(`(() =>
  [...document.querySelectorAll(".terminal-pane.active .xterm-rows > div")]
    .map((row) => row.textContent)
    .join("\\n")
    .includes(${JSON.stringify(completionMarker)})
)()`);

await waitFor(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy === false)`,
);
await send("Input.insertText", { text: "sleep 20" });
await press("Enter", "Enter");
await delay(350);
const clipboardSentinel = `FZ_CLIPBOARD_SENTINEL_${Date.now()}`;
await evaluate(
  `window.fzTerminal.clipboard.writeText(${JSON.stringify(clipboardSentinel)})`,
);
const selection = await evaluate(`(() => {
  const row = [...document.querySelectorAll(
    ".terminal-pane.active .xterm-rows > div",
  )].findLast((candidate) =>
    candidate.textContent.includes(${JSON.stringify(completionMarker)})
  );
  const rect = row?.getBoundingClientRect();
  return rect
    ? {
        startX: rect.left + 4,
        endX: Math.min(rect.right - 4, rect.left + 180),
        y: rect.top + rect.height / 2,
      }
    : null;
})()`);
if (!selection) throw new Error("Could not find text to select");
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: selection.startX,
  y: selection.y,
  button: "left",
  buttons: 1,
  clickCount: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: selection.endX,
  y: selection.y,
  button: "left",
  buttons: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: selection.endX,
  y: selection.y,
  button: "left",
  buttons: 0,
  clickCount: 1,
});
await delay(100);
const clipboardPreservedBeforeSelectedCtrlC = await evaluate(
  `window.fzTerminal.clipboard.readText()
    .then((value) => value === ${JSON.stringify(clipboardSentinel)})`,
);
await press("с", "KeyC", 2, 67);
await delay(200);
const copiedSelection = await evaluate(
  `window.fzTerminal.clipboard.readText()`,
);
const busyAfterSelectedCtrlC = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy)`,
);
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: selection.startX,
  y: selection.y + 22,
  button: "left",
  buttons: 1,
  clickCount: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: selection.startX,
  y: selection.y + 22,
  button: "left",
  buttons: 0,
  clickCount: 1,
});
await press("с", "KeyC", 2, 67);
await delay(450);
const busyAfterUnselectedCtrlC = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy)`,
);

const report = {
  autocomplete: {
    defaultDisabled: autocompleteSetting.before === false,
    setting: autocompleteSetting,
    suggestionWhileDisabled,
    suggestionWhileIdle,
  },
  shortcutRecording: {
    ...shortcutRecording,
    newTabShortcutBlocked,
    busyAfterRecording,
  },
  busyBeforeInterrupt,
  busyAfterInterrupt,
  suggestionWhileBusy,
  terminalResponsive,
  ctrlCSelectionHierarchy: {
    clipboardPreservedBeforeSelectedCtrlC,
    copiedSelection,
    busyAfterSelectedCtrlC,
    busyAfterUnselectedCtrlC,
  },
};
console.log(JSON.stringify(report, null, 2));

if (
  suggestionWhileDisabled ||
  !autocompleteSetting.found ||
  autocompleteSetting.before !== false ||
  autocompleteSetting.after !== true ||
  !autocompleteSetting.copyOnSelectDisabled ||
  !suggestionWhileIdle ||
  !newTabShortcutBlocked ||
  busyAfterRecording !== true ||
  !shortcutRecording.conflict ||
  shortcutRecording.conflictRows < 2 ||
  busyBeforeInterrupt !== true ||
  busyAfterInterrupt !== false ||
  suggestionWhileBusy ||
  !terminalResponsive ||
  !clipboardPreservedBeforeSelectedCtrlC ||
  !copiedSelection.startsWith("FZ_INTERRUPT_") ||
  busyAfterSelectedCtrlC !== true ||
  busyAfterUnselectedCtrlC !== false
) {
  throw new Error("Terminal interrupt regression smoke test failed");
}
} finally {
  await evaluate(
    `window.fzTerminal.clipboard.writeText(${JSON.stringify(originalClipboard)})`,
  ).catch(() => {});
  socket.close();
}
