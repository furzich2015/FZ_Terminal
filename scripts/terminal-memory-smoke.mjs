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

async function waitFor(expression, timeout = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function press(key, code, modifiers = 0) {
  const virtualKey =
    key === "Enter" ? 13 : key === "Escape" ? 27 : key.toUpperCase().charCodeAt(0);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtualKey,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtualKey,
  });
}

async function type(text) {
  await send("Input.insertText", { text });
}

await send("Runtime.enable");
await evaluate(`document.querySelector(".new-tab-button")?.click()`);
await delay(80);
await evaluate(`(() => {
  const entry = [...document.querySelectorAll(".context-menu .menu-entry")]
    .find((node) => node.textContent.trim() === "Terminal");
  entry?.click();
})()`);
await delay(400);

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
  return findPane(tab.root).sessionId;
})()`);
const paneSelector = `.terminal-pane[data-session-id="${sessionId}"]`;
await waitFor(
  `window.fzTerminal.pty
    .listDirectory(${JSON.stringify(sessionId)})
    .then((result) => Boolean(result.cwd))`,
);
await evaluate(
  `(() => {
    document.querySelector(
      ${JSON.stringify(`${paneSelector} .terminal-host`)},
    )?.click();
    document.querySelector(
      ${JSON.stringify(`${paneSelector} .xterm-helper-textarea`)},
    )?.focus();
  })()`,
);
const sidebarWasVisible = await evaluate(
  `Boolean(document.querySelector(".sidebar"))`,
);
const terminalSettings = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  return state.settings.terminal;
})()`);
const screenScrollConfigured = terminalSettings.screenScrollMode;

const selectionCommand = `printf 'FZ_SELECT_${Date.now()}\\n'`;
await type(selectionCommand);
await delay(300);
await press("a", "KeyA", 2);
await delay(80);
const selectedText = await evaluate(`window.fzTerminal.clipboard.readText()`);
await press("Enter", "Enter");
await delay(250);

const copySafeMarker = `FZ_COPY_SAFE_${Date.now()}`;
const copySafeCommand = `printf '${copySafeMarker}\\n'`;
await type(copySafeCommand);
await press("Enter", "Enter");
await delay(250);
const copySafe = await evaluate(`(() => {
  const blocks = JSON.parse(
    localStorage.getItem(
      ${JSON.stringify(`fz-terminal-command-blocks:${sessionId}`)},
    ) || "[]",
  );
  const block = blocks.find(
    (item) => item.command === ${JSON.stringify(copySafeCommand)},
  );
  return {
    recorded: Boolean(block),
    producedOutput: Boolean(
      block?.output.includes(${JSON.stringify(copySafeMarker)}),
    ),
  };
})()`);

const largeCommand = "seq 1 40000";
await type(largeCommand);
await press("Enter", "Enter");
await delay(1800);
const memory = await evaluate(`(() => {
  const blocks = JSON.parse(
    localStorage.getItem(
      ${JSON.stringify(`fz-terminal-command-blocks:${sessionId}`)},
    ) || "[]",
  );
  const block = blocks.find(
    (item) => item.command === ${JSON.stringify(largeCommand)},
  );
  const state = JSON.parse(localStorage.getItem("fz-terminal-state")).state;
  return {
    scrollback: state.settings.terminal.scrollback,
    railVisible: Boolean(document.querySelector(".command-block-rail")),
    blockLength: block?.output.length ?? 0,
    hasFirst: Boolean(block?.output.includes("\\n1\\n")),
    hasLast: Boolean(block?.output.includes("40000")),
  };
})()`);

await evaluate(`(() => {
  const block = [...document.querySelectorAll(".command-block-chip")]
    .find((item) => item.querySelector("code")?.textContent ===
      ${JSON.stringify(largeCommand)});
  block?.click();
})()`);
await delay(150);
const openedBlock = await evaluate(`(() => ({
  open: Boolean(document.querySelector(".terminal-history")),
  command: document.querySelector(
    ".terminal-history .history-block.selected header code",
  )?.textContent,
  hasLast: document.querySelector(
    ".terminal-history .history-block.selected pre",
  )?.textContent.includes("40000") ?? false,
}))()`);
await evaluate(`document
  .querySelector('.terminal-history button[title="Close history"]')
  ?.click()`);
await delay(100);

await evaluate(
  `window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "bash -c 'exec -a screen sleep 8'\\r")`,
);
await delay(1650);
const wheel = `document
  .querySelector(${JSON.stringify(`${paneSelector} .terminal-host`)})
  ?.dispatchEvent(new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -140,
  }))`;
await evaluate(wheel);
await delay(100);
const screenBeforeResize = await evaluate(
  `document.querySelector(${JSON.stringify(`${paneSelector} .pane-mode`)})?.textContent`,
);
await evaluate(`document
  .querySelector('.titlebar-actions button[title="Toggle Commands"]')
  ?.click()`);
await delay(350);
const screenAfterResize = await evaluate(
  `document.querySelector(${JSON.stringify(`${paneSelector} .pane-mode`)})?.textContent`,
);
await evaluate(wheel);
await delay(100);
const screenAfterWheel = await evaluate(
  `document.querySelector(${JSON.stringify(`${paneSelector} .pane-mode`)})?.textContent`,
);
await evaluate(
  `window.fzTerminal.pty.write(${JSON.stringify(sessionId)}, "\\u001b\\u0003")`,
);
await evaluate(`(() => {
  const sidebarIsVisible = Boolean(document.querySelector(".sidebar"));
  if (sidebarIsVisible !== ${JSON.stringify(sidebarWasVisible)}) {
    document.querySelector(
      '.titlebar-actions button[title="Toggle Commands"]',
    )?.click();
  }
})()`);
await delay(200);

await evaluate(`localStorage.removeItem(
  ${JSON.stringify(`fz-terminal-command-blocks:${sessionId}`)},
)`);
await evaluate(`document.querySelector(".tab.active .tab-close")?.click()`);
await delay(100);
await evaluate(`document.querySelector(".modal-card .button.danger")?.click()`);

const report = {
  selection: {
    expected: selectionCommand,
    copied: selectedText,
    automatic: selectedText === selectionCommand,
    copyOnSelect: terminalSettings.copyOnSelect,
  },
  copySafe,
  memory,
  openedBlock,
  screen: {
    configured: screenScrollConfigured,
    beforeResize: screenBeforeResize,
    afterResize: screenAfterResize,
    afterWheel: screenAfterWheel,
  },
};
const failures = [];
if (selectedText !== selectionCommand) {
  failures.push("Ctrl+A selection was not copied automatically");
}
if (!copySafe.recorded || !copySafe.producedOutput) {
  failures.push("typing after an automatic copy changed command execution");
}
if (memory.scrollback < 20_000) {
  failures.push("scrollback migration retained too few lines");
}
if (!memory.railVisible || memory.blockLength < 100_000) {
  failures.push("large command output was not retained in a collapsed block");
}
if (!memory.hasFirst || !memory.hasLast) {
  failures.push("large command block did not retain both output edges");
}
if (
  !openedBlock.open ||
  openedBlock.command !== largeCommand ||
  !openedBlock.hasLast
) {
  failures.push("clicking a collapsed block did not open its output");
}
if (screenScrollConfigured) {
  if (!screenBeforeResize?.includes("SCREEN COPY")) {
    failures.push("GNU Screen wheel did not enter copy mode before resize");
  }
  if (!screenAfterResize?.includes("SCREEN WHEEL")) {
    failures.push("GNU Screen copy mode was not reset after resize");
  }
  if (!screenAfterWheel?.includes("SCREEN COPY")) {
    failures.push("GNU Screen wheel did not recover after resize");
  }
} else if (
  screenBeforeResize?.includes("COPY") ||
  screenAfterResize?.includes("COPY") ||
  screenAfterWheel?.includes("COPY")
) {
  failures.push("GNU Screen wheel automated copy mode while disabled");
}

console.log(JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2));
socket.close();
await delay(50);
process.exit(failures.length > 0 ? 1 : 0);
