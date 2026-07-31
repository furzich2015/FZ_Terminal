const port = Number(process.env.FZ_CDP_PORT || 9339);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let target;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    );
    target = targets.find(
      (item) => item.type === "page" && item.title === "FZ Terminal",
    );
    if (target) break;
  } catch {
    // The renderer can take a moment to expose its debugging target.
  }
  await delay(100);
}
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
  const virtualKey =
    key === "Enter" ? 13 : key.toUpperCase().charCodeAt(0);
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

await send("Runtime.enable");
for (let attempt = 0; attempt < 60; attempt += 1) {
  const ready = await evaluate(`Boolean(
    document.querySelector(".terminal-pane .xterm-helper-textarea")
  )`);
  if (ready) break;
  await delay(100);
}
await evaluate(`(() => {
  const input = document.querySelector(
    ".terminal-pane .xterm-helper-textarea"
  );
  input?.focus();
  return document.activeElement === input;
})()`);

await send("Input.insertText", { text: "bash" });
await press("Enter", "Enter");
await delay(350);
await press("d", "KeyD", 2);
await delay(350);
const survivedNestedShell = await evaluate(
  `Boolean(document.querySelector(".terminal-pane"))`,
);
if (!survivedNestedShell) {
  throw new Error("Ctrl+D closed the window from a nested shell");
}

const closed = new Promise((resolve) => {
  socket.addEventListener("close", () => resolve(true), { once: true });
  setTimeout(() => resolve(false), 5_000);
});
await press("d", "KeyD", 2);
if (!(await closed)) {
  socket.close();
  throw new Error("Ctrl+D did not close the last local shell window");
}

console.log(
  JSON.stringify({
    ok: true,
    nestedShellPreserved: survivedNestedShell,
    lastLocalShellClosedWindow: true,
  }),
);
process.exit(0);
