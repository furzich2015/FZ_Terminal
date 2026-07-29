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

async function clickNewTab(label) {
  await evaluate(`document.querySelector(".new-tab-button")?.click()`);
  await delay(80);
  const clicked = await evaluate(`(() => {
    const entry = [...document.querySelectorAll(".context-menu .menu-entry")]
      .find((node) => node.textContent.trim() === ${JSON.stringify(label)});
    entry?.click();
    return Boolean(entry);
  })()`);
  if (!clicked) throw new Error(`New ${label} menu item was not clickable`);
  await delay(label === "Browser" ? 900 : 350);
}

await send("Runtime.enable");
if (process.env.FZ_UPDATE_DIAG === "1") {
  const diagnostics = await evaluate(`(async () => {
    document.querySelector(
      '.titlebar-actions button[title="Settings"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const updateSection = [...document.querySelectorAll(
      ".settings-nav > button",
    )].find((button) => button.textContent.trim() === "Updates");
    updateSection?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const profile = await window.fzTerminal.profile.info();
    const update = await window.fzTerminal.updates.getStatus();
    return {
      sectionOpened:
        document.querySelector(".settings-page-header h3")?.textContent ===
        "Updates",
      profile,
      update,
      actions: [...document.querySelectorAll(".update-actions button")].map(
        (button) => ({
          label: button.textContent.trim(),
          disabled: button.disabled,
        }),
      ),
    };
  })()`);
  console.log(JSON.stringify(diagnostics, null, 2));
  socket.close();
  process.exit(0);
}

if (process.env.FZ_CLEANUP === "1") {
  const homeDirectory = await evaluate(
    `window.fzTerminal.files.home()`,
  );
  const removed = await evaluate(`(() => {
    const key = "fz-terminal-state";
    const persisted = JSON.parse(localStorage.getItem(key));
    let count = 0;
    persisted.state.workspaces = persisted.state.workspaces.map((workspace) => {
      const tabs = workspace.tabs.filter((tab) => {
        const generated =
          (tab.kind === "browser" &&
            tab.browserUrl === "https://example.com/") ||
          (tab.kind === "files" &&
            tab.filePath === ${JSON.stringify(homeDirectory)}) ||
          (tab.kind === "note" &&
            tab.noteContent === "first line\\nsecond line");
        if (generated) count += 1;
        return !generated;
      });
      const activeExists = tabs.some(
        (tab) => tab.id === workspace.activeTabId,
      );
      return {
        ...workspace,
        tabs,
        activeTabId: activeExists
          ? workspace.activeTabId
          : (tabs.find((tab) => tab.kind === "terminal") ?? tabs[0]).id,
      };
    });
    localStorage.setItem(key, JSON.stringify(persisted));
    return count;
  })()`);
  console.log(JSON.stringify({ cleaned: true, removed }, null, 2));
  socket.close();
  process.exit(0);
}

if (process.env.FZ_DIAG === "1") {
  const diagnostics = await evaluate(`(() => ({
    tabs: [...document.querySelectorAll(".tab")].map((tab) => ({
      kind: tab.dataset.tabKind,
      name: tab.querySelector(".tab-name")?.textContent,
      active: tab.classList.contains("active"),
    })),
    sidebar: Boolean(document.querySelector(".sidebar")),
    commandButtons: document.querySelectorAll(".command-run").length,
    commandsToggle: Boolean(
      document.querySelector(
        '.titlebar-actions button[title="Toggle Commands"]',
      ),
    ),
    activeElement: document.activeElement?.className,
    persistedTabs: (() => {
      const state = JSON.parse(
        localStorage.getItem("fz-terminal-state"),
      ).state;
      const workspace = state.workspaces.find(
        (item) => item.id === state.activeWorkspaceId,
      );
      return workspace.tabs.map((tab) => ({
        id: tab.id,
        kind: tab.kind,
        name: tab.name,
        browserUrl: tab.browserUrl,
        filePath: tab.filePath,
        noteContent: tab.noteContent,
      }));
    })(),
  }))()`);
  console.log(JSON.stringify(diagnostics, null, 2));
  socket.close();
  process.exit(0);
}

await evaluate(`document
  .querySelector('.tab[data-tab-kind="terminal"] .tab-main')
  ?.click()`);
await delay(180);
const originalSidebarVisible = await evaluate(
  `Boolean(document.querySelector(".sidebar"))`,
);
await evaluate(`(() => {
  if (document.querySelector(".sidebar")) {
    document.querySelector(
      '.titlebar-actions button[title="Toggle Commands"]',
    )?.click();
  }
})()`);
await delay(120);
const initial = await evaluate(`(() => {
  const stage = document.querySelector(".terminal-stage").getBoundingClientRect();
  const paneElement = document.querySelector(".terminal-pane");
  const pane = paneElement.getBoundingClientRect();
  const allocation = (
    paneElement.closest(".split-child") ??
    document.querySelector(".terminal-stage")
  ).getBoundingClientRect();
  const host = document.querySelector(".terminal-host").getBoundingClientRect();
  return {
    sidebarHidden: !document.querySelector(".sidebar"),
    titlebar: document.querySelector(".titlebar").innerText,
    stageCoverage: {
      width: pane.width / stage.width,
      height: pane.height / stage.height,
      hostHeight: host.height / pane.height,
    },
    allocationCoverage: {
      width: pane.width / allocation.width,
      height: pane.height / allocation.height,
    }
  };
})()`);

await evaluate(
  `window.dispatchEvent(new CustomEvent("fz:open-browser", { detail: "https://example.com/" }))`,
);
await delay(900);
const browser = await evaluate(`(() => {
  const pane = document.querySelector(".browser-pane");
  const viewport = document.querySelector(".browser-viewport");
  return {
    mounted: Boolean(pane),
    url: document.querySelector(".browser-address input")?.value,
    viewportHeight: viewport?.getBoundingClientRect().height ?? 0,
  };
})()`);

await clickNewTab("Files");
const files = await evaluate(`(() => ({
  mounted: Boolean(document.querySelector(".files-pane")),
  cwd: document.querySelector(".files-path input")?.value,
  rows: document.querySelectorAll(".file-row").length,
}))()`);

await clickNewTab("Note");
const note = await evaluate(`(() => {
  const field = document.querySelector(".note-editor textarea");
  if (!field) return { mounted: false };
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setter.call(field, "first line\\nsecond line");
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return {
    mounted: true,
    lines: document.querySelectorAll(".note-lines span").length,
  };
})()`);
await delay(100);

await evaluate(`(() => {
  const terminalTab = document.querySelector('.tab[data-tab-kind="terminal"]');
  terminalTab?.querySelector(".tab-main")?.click();
})()`);
await delay(200);
await evaluate(`(() => {
  if (!document.querySelector(".sidebar")) {
    document.querySelector(
      '.titlebar-actions button[title="Toggle Commands"]',
    )?.click();
  }
})()`);
await delay(200);
await evaluate(`(() => {
  if (!document.querySelector(".command-run")) {
    document.querySelector(".group-toggle")?.click();
  }
})()`);
await delay(160);
const quickClicked = await evaluate(`(async () => {
  const commandButton = document.querySelector(".command-run");
  commandButton?.focus();
  const persisted = JSON.parse(
    localStorage.getItem("fz-terminal-state"),
  ).state;
  const workspace = persisted.workspaces.find(
    (item) => item.id === persisted.activeWorkspaceId,
  );
  const tab = workspace.tabs.find(
    (item) => item.id === workspace.activeTabId,
  );
  const findPane = (node) =>
    node.type === "pane"
      ? (node.id === tab.activePaneId ? node : null)
      : findPane(node.first) || findPane(node.second);
  const pane = findPane(tab.root);
  const value = "printf 'fz-smoke-safe\\\\n'";
  window.fzTerminal.pty.write(pane.sessionId, "\\u0003");
  await new Promise((resolve) => setTimeout(resolve, 120));
  window.dispatchEvent(
    new CustomEvent("fz:quick-command", {
      detail: {
        sessionId: pane.sessionId,
        command: value,
        execute: true,
      },
    }),
  );
  window.fzTerminal.pty.write(pane.sessionId, value + "\\r");
  return commandButton ? value : "";
})()`);
await delay(1000);
const beforeEnter = await evaluate(`(() => {
  const rows = [...document.querySelectorAll(".xterm-rows > div")]
    .map((row) => row.textContent).join("\\n");
  return {
    focused: document.activeElement?.classList.contains("xterm-helper-textarea"),
    occurrences: rows.split(${JSON.stringify(quickClicked)}).length - 1,
  };
})()`);
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
  nativeVirtualKeyCode: 13,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
  nativeVirtualKeyCode: 13,
});
await delay(450);
const afterEnter = await evaluate(`(() => {
  const rows = [...document.querySelectorAll(".xterm-rows > div")]
    .map((row) => row.textContent).join("\\n");
  return rows.split(${JSON.stringify(quickClicked)}).length - 1;
})()`);

await evaluate(`document.querySelector(
  '.terminal-pane.active .pane-actions button[title*="saved command blocks"]',
)?.click()`);
await delay(120);
const historyBefore = await evaluate(
  `document.querySelectorAll(".history-index-item").length`,
);
await evaluate(`(() => {
  const field = document.querySelector(".history-search input");
  if (!field) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(field, ${JSON.stringify(quickClicked)});
  field.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await delay(80);
const historySearch = await evaluate(`(() => ({
  count: document.querySelector(".history-search output")?.textContent,
  marks: document.querySelectorAll(".history-block mark").length,
}))()`);
await evaluate(`document.querySelector(".history-delete")?.click()`);
await delay(80);
const historyAfter = await evaluate(
  `document.querySelectorAll(".history-index-item").length`,
);

const report = {
  initial,
  browser,
  files,
  note,
  quickCommand: {
    clicked: Boolean(quickClicked),
    value: quickClicked,
    focused: beforeEnter.focused,
    beforeEnter: beforeEnter.occurrences,
    afterEnter,
    duplicated: afterEnter > beforeEnter.occurrences,
  },
  history: {
    beforeDelete: historyBefore,
    afterDelete: historyAfter,
    search: historySearch,
  },
};

const failures = [];
if (!initial.sidebarHidden) failures.push("sidebar is visible by default");
if (/\bShell\b|\bEdit\b|\bView\b/.test(initial.titlebar)) {
  failures.push("legacy menu labels remain in the titlebar");
}
if (
  initial.allocationCoverage.width < 0.98 ||
  initial.allocationCoverage.height < 0.98
) {
  failures.push("terminal pane does not fill its split allocation");
}
if (!browser.mounted || browser.viewportHeight < 100) {
  failures.push("browser tab did not mount");
}
if (!files.mounted || files.rows < 1) failures.push("files tab is empty");
if (!note.mounted || note.lines !== 2) failures.push("note lines did not update");
if (!quickClicked || !beforeEnter.focused) {
  failures.push("quick command did not return focus to xterm");
}
if (afterEnter > beforeEnter.occurrences) {
  failures.push("Enter duplicated the quick command");
}
if (historyBefore < 1) failures.push("command block was not saved");
if (historySearch.marks < 1) failures.push("exact block search found no match");
if (historyAfter !== historyBefore - 1) {
  failures.push("individual command block deletion failed");
}

await evaluate(`(() => {
  const visible = Boolean(document.querySelector(".sidebar"));
  if (visible !== ${JSON.stringify(originalSidebarVisible)}) {
    document.querySelector(
      '.titlebar-actions button[title="Toggle Commands"]',
    )?.click();
  }
})()`);

console.log(JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2));
socket.close();
process.exit(failures.length > 0 ? 1 : 0);
