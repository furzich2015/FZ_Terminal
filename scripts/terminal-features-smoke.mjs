const port = Number(process.env.FZ_CDP_PORT || 9333);
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
  const keyCodes = {
    Enter: 13,
    Escape: 27,
    Tab: 9,
    " ": 32,
  };
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode:
      keyCodes[key] ?? key.toUpperCase().charCodeAt(0),
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode:
      keyCodes[key] ?? key.toUpperCase().charCodeAt(0),
  });
}

async function pressShortcut(shortcut) {
  const parts = shortcut.split("+");
  const rawKey = parts.at(-1);
  const primaryModifier = process.platform === "darwin" ? 4 : 2;
  const modifiers =
    (parts.includes("Primary") ? primaryModifier : 0) +
    (parts.includes("Ctrl") ? 2 : 0) +
    (parts.includes("Meta") ? 4 : 0) +
    (parts.includes("Shift") ? 8 : 0) +
    (parts.includes("Alt") ? 1 : 0);
  const keys = {
    Equal: ["=", "Equal"],
    Minus: ["-", "Minus"],
    Digit0: ["0", "Digit0"],
    Space: [" ", "Space"],
    Comma: [",", "Comma"],
    Tab: ["Tab", "Tab"],
  };
  const [key, code] = keys[rawKey] ?? [
    rawKey,
    rawKey.length === 1 ? `Key${rawKey.toUpperCase()}` : rawKey,
  ];
  await press(key, code, modifiers);
}

await send("Runtime.enable");
const localSettings = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  return {
    shortcuts: state.settings.shortcuts,
    screenScrollMode: state.settings.terminal.screenScrollMode,
  };
})()`);
await evaluate(`document.querySelector(".new-tab-button")?.click()`);
await delay(80);
await evaluate(`(() => {
  const entry = [...document.querySelectorAll(".context-menu .menu-entry")]
    .find((node) => node.textContent.trim() === "Terminal");
  entry?.click();
})()`);
await delay(350);

const sessionId = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  const workspace = state.workspaces.find(
    (item) => item.id === state.activeWorkspaceId,
  );
  const tab = workspace.tabs.find((item) => item.id === workspace.activeTabId);
  const findPane = (node) =>
    node.type === "pane"
      ? (node.id === tab.activePaneId ? node : null)
      : findPane(node.first) || findPane(node.second);
  document.querySelector(".terminal-pane.active .terminal-host")?.click();
  return findPane(tab.root).sessionId;
})()`);

const marker = `FZ_PASTE_${Date.now()}`;
const command = `printf '${marker}\\\\n'`;
await evaluate(
  `window.fzTerminal.clipboard.writeText(${JSON.stringify(command)})`,
);
await delay(80);
await pressShortcut(localSettings.shortcuts.pasteTerminal);
await delay(180);
const beforeEnter = await evaluate(`(() => {
  const rows = [...document.querySelectorAll(
    ".terminal-pane.active .xterm-rows > div",
  )].map((row) => row.textContent).join("\\n");
  return (rows.split(${JSON.stringify(marker)}).length - 1);
})()`);
await press("Enter", "Enter");
await delay(350);
const afterEnter = await evaluate(`(() => {
  const rows = [...document.querySelectorAll(
    ".terminal-pane.active .xterm-rows > div",
  )].map((row) => row.textContent).join("\\n");
  return (rows.split(${JSON.stringify(marker)}).length - 1);
})()`);
const commandExecuted = await evaluate(`(() => {
  const blocks = JSON.parse(
    localStorage.getItem(
      ${JSON.stringify(`fz-terminal-command-blocks:${sessionId}`)},
    ) || "[]",
  );
  const block = blocks.find(
    (item) => item.command === ${JSON.stringify(command)},
  );
  return Boolean(block?.output.includes(${JSON.stringify(marker)}));
})()`);

await pressShortcut(localSettings.shortcuts.searchTerminal);
await delay(80);
await evaluate(`(() => {
  const field = document.querySelector(".terminal-search input");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(field, ${JSON.stringify(marker)});
  field.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await delay(120);
const search = await evaluate(`(() => ({
  count: document.querySelector(".terminal-search-count")?.textContent,
  swatch: document.querySelector(".terminal-search-mode i")?.style.background,
  decorations: document.querySelectorAll(
    ".terminal-pane.active .xterm-decoration",
  ).length,
}))()`);
await press("Escape", "Escape");

await evaluate(
  `window.dispatchEvent(new CustomEvent("fz:show-completions", { detail: ${JSON.stringify(sessionId)} }))`,
);
await delay(220);
const completionBefore = await evaluate(`(() => {
  const list = document.querySelector(".completion-list");
  return {
    open: Boolean(document.querySelector(".completion-popup")),
    count: document.querySelectorAll(".completion-list button").length,
    scrollable: Boolean(list && list.scrollHeight > list.clientHeight),
    first: document.querySelector(".completion-list button span")?.textContent,
  };
})()`);
if (completionBefore.first) {
  await evaluate(`(() => {
    const field = document.querySelector(".completion-search input");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(field, ${JSON.stringify(completionBefore.first.slice(0, 2))});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    const list = document.querySelector(".completion-list");
    list.scrollTop = Math.min(40, list.scrollHeight);
    list.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 80,
      }),
    );
  })()`);
}
await delay(80);
const completionAfter = await evaluate(`(() => ({
  open: Boolean(document.querySelector(".completion-popup")),
  count: document.querySelectorAll(".completion-list button").length,
}))()`);
await press("Escape", "Escape");

await evaluate(
  `window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "bash -c 'exec -a ssh sleep 6'\\r")`,
);
await delay(450);
const sshContext = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})`,
);
await evaluate(
  `window.dispatchEvent(new CustomEvent("fz:show-completions", { detail: ${JSON.stringify(sessionId)} }))`,
);
await delay(180);
const sshCompletion = await evaluate(`(() => ({
  popup: Boolean(document.querySelector(".completion-popup")),
  notice: document.querySelector(".completion-notice")?.textContent,
}))()`);
await evaluate(
  `window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "\\u0003")`,
);
await delay(180);

await evaluate(
  `window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "bash -c 'exec -a screen sleep 6'\\r")`,
);
await delay(1650);
const screenContext = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})`,
);
const wheelScreen = () => evaluate(`document
  .querySelector(".terminal-pane.active .terminal-host")
  ?.dispatchEvent(new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -130,
  }))`);
await wheelScreen();
await delay(120);
const automaticScreenMode = await evaluate(
  `document.querySelector(
    ".terminal-pane.active .pane-mode, .terminal-pane.active .screen-mode-indicator",
  )?.textContent`,
);
if (!localSettings.screenScrollMode) {
  await evaluate(`(() => {
    const pane = document.querySelector(".terminal-pane.active");
    pane?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 160,
    }));
  })()`);
  await delay(80);
  await evaluate(`(() => {
    const entry = [...document.querySelectorAll(".context-menu .menu-entry")]
      .find((item) => item.textContent.includes("Enable GNU Screen wheel"));
    entry?.click();
  })()`);
  await delay(80);
  await wheelScreen();
  await delay(120);
}
const optedInScreenMode = await evaluate(
  `document.querySelector(
    ".terminal-pane.active .pane-mode, .terminal-pane.active .screen-mode-indicator",
  )?.textContent`,
);
await evaluate(
  `window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "\\u0003")`,
);

await evaluate(`localStorage.removeItem(
  ${JSON.stringify(`fz-terminal-command-blocks:${sessionId}`)},
)`);
await evaluate(`document.querySelector(".tab.active .tab-close")?.click()`);
await delay(100);
await evaluate(`document.querySelector(".modal-card .button.danger")?.click()`);

const report = {
  paste: { beforeEnter, afterEnter, commandExecuted },
  search,
  completion: { before: completionBefore, after: completionAfter },
  ssh: { context: sshContext, completion: sshCompletion },
  screen: {
    setting: localSettings.screenScrollMode,
    context: screenContext,
    automaticMode: automaticScreenMode,
    optedInMode: optedInScreenMode,
  },
};
const failures = [];
if (beforeEnter !== 1) failures.push("Paste shortcut pasted more or less than once");
if (!commandExecuted) failures.push("The pasted command was not executed");
if (!search.count || search.count === "0/0") {
  failures.push("Search shortcut did not find the exact terminal text");
}
if (!search.swatch) failures.push("search highlight color is not visible");
if (!completionBefore.open || completionBefore.count < 1) {
  failures.push("local completion did not open");
}
if (!completionBefore.scrollable) failures.push("completion list is not scrollable");
if (!completionAfter.open) failures.push("completion closed while scrolling");
if (!sshContext.remote) failures.push("SSH process was not detected");
if (sshCompletion.popup || !sshCompletion.notice) {
  failures.push("local completion remained enabled during SSH");
}
if (screenContext.multiplexer !== "screen") {
  failures.push("GNU Screen process was not detected");
}
if (
  localSettings.screenScrollMode &&
  !automaticScreenMode?.includes("SCREEN COPY")
) {
  failures.push("Enabled Screen setting did not apply automatically");
}
if (
  !localSettings.screenScrollMode &&
  automaticScreenMode?.includes("SCREEN COPY")
) {
  failures.push("Disabled Screen setting applied automatic wheel behavior");
}
if (!optedInScreenMode?.includes("SCREEN COPY")) {
  failures.push("Screen wheel did not enter copy mode after opt-in");
}

console.log(JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2));
socket.close();
process.exit(failures.length > 0 ? 1 : 0);
