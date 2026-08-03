const port = Number(process.env.FZ_CDP_PORT || 9347);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let targets = [];
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    );
    if (targets.some((item) => item.type === "page")) break;
  } catch {
    // Electron may still be starting.
  }
  await delay(100);
}
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
    key === "Enter" ? 13 : key === "Tab" ? 9 : key.toUpperCase().charCodeAt(0);
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      modifiers,
      windowsVirtualKeyCode,
    });
  }
}

await send("Runtime.enable");
await delay(250);
await evaluate(
  `document.querySelector(".terminal-pane.active .terminal-host")?.click()`,
);
await send("Input.insertText", { text: "cd /etc" });
await press("Enter", "Enter");
await delay(180);
await send("Input.insertText", { text: "cat " });
await press("Tab", "Tab");
await delay(250);

const popup = await evaluate(`(() => {
  const popup = document.querySelector(".completion-popup");
  const cursor = document.querySelector(
    ".terminal-pane.active .xterm-cursor-layer .xterm-cursor",
  );
  const cursorRow = [...document.querySelectorAll(
    ".terminal-pane.active .xterm-rows > div",
  )]
    .filter((row) => row.textContent.includes("cat "))
    .at(-1);
  const popupRect = popup?.getBoundingClientRect();
  const cursorRect =
    cursor?.getBoundingClientRect() ?? cursorRow?.getBoundingClientRect();
  return {
    mounted: Boolean(popup),
    cwd: popup?.querySelector("header span")?.getAttribute("title"),
    entries: popup?.querySelectorAll(".completion-list button").length ?? 0,
    popupRect: popupRect
      ? { top: popupRect.top, bottom: popupRect.bottom }
      : null,
    cursorRect: cursorRect
      ? { top: cursorRect.top, bottom: cursorRect.bottom }
      : null,
    belowCursor: Boolean(
      popupRect && cursorRect && popupRect.top >= cursorRect.bottom - 1
    ),
  };
})()`);

await press("Escape", "Escape");
await press("u", "KeyU", 2);
await evaluate(
  `document.querySelector('.titlebar-actions button[title="Settings"]')?.click()`,
);
await delay(300);
await evaluate(`(() => {
  [...document.querySelectorAll(".settings-nav > button")]
    .find((button) => button.textContent.trim() === "Terminal")
    ?.click();
})()`);
await delay(180);
const toggle = await evaluate(`(() => {
  const row = [...document.querySelectorAll(".toggle-row")].find(
    (item) => item.querySelector("strong")?.textContent ===
      "File search popup on Tab",
  );
  const input = row?.querySelector('input[type="checkbox"]');
  const before = input?.checked;
  input?.click();
  return {
    found: Boolean(input),
    before,
    modal: Boolean(document.querySelector(".modal-card")),
    sections: [...document.querySelectorAll(".settings-nav > button")]
      .map((button) => button.textContent.trim()),
    labels: [...document.querySelectorAll(".toggle-row strong")]
      .map((label) => label.textContent),
  };
})()`);
await delay(80);
await evaluate(`document.querySelector(".modal-header button[aria-label='Close']")?.click()`);
await delay(80);
await evaluate(
  `document.querySelector(".terminal-pane.active .terminal-host")?.click()`,
);
await send("Input.insertText", { text: "cat " });
await press("Tab", "Tab");
await delay(180);
const disabled = await evaluate(
  `!document.querySelector(".completion-popup")`,
);

const failures = [];
if (!popup.mounted || popup.cwd !== "/etc" || popup.entries < 1) {
  failures.push("completion popup did not use the current /etc directory");
}
if (!popup.belowCursor) failures.push("completion popup is not below the cursor");
if (!toggle.found || toggle.before !== true || !disabled) {
  failures.push("completion popup setting did not disable the popup");
}

console.log(
  JSON.stringify(
    { ok: failures.length === 0, failures, popup, toggle, disabled },
    null,
    2,
  ),
);
socket.close();
process.exit(failures.length > 0 ? 1 : 0);
