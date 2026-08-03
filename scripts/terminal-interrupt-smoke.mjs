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

const marker = `FZ_INTERRUPT_${Date.now()}`;
const historyCommand = `echo ${marker}`;
await send("Input.insertText", { text: historyCommand });
await press("Enter", "Enter");
await delay(300);

await send("Input.insertText", { text: "sleep 20" });
await press("Enter", "Enter");
await delay(350);
const busyBeforeInterrupt = await evaluate(
  `window.fzTerminal.pty.getContext(${JSON.stringify(sessionId)})
    .then((context) => context.busy)`,
);

await send("Input.insertText", { text: historyCommand.slice(0, -4) });
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

const report = {
  busyBeforeInterrupt,
  busyAfterInterrupt,
  suggestionWhileBusy,
  terminalResponsive,
};
console.log(JSON.stringify(report, null, 2));
socket.close();

if (
  busyBeforeInterrupt !== true ||
  busyAfterInterrupt !== false ||
  suggestionWhileBusy ||
  !terminalResponsive
) {
  throw new Error("Terminal interrupt regression smoke test failed");
}
