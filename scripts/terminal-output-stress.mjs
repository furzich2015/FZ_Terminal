const port = Number(process.env.FZ_CDP_PORT || 9341);
const lineCount = Number(process.env.FZ_STRESS_LINES || 500_000);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let target;
for (let attempt = 0; attempt < 100; attempt += 1) {
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

await send("Runtime.enable");
await send("Performance.enable");
for (let attempt = 0; attempt < 100; attempt += 1) {
  const ready = await evaluate(`Boolean(
    document.querySelector(".terminal-pane .xterm-helper-textarea")
  )`);
  if (ready) break;
  await delay(100);
}
await evaluate(`document.querySelector(
  ".terminal-pane .xterm-helper-textarea"
)?.focus()`);
const command = `seq 1 ${lineCount}`;
await send("Input.insertText", { text: command });
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
});

let completed = false;
for (let attempt = 0; attempt < 200; attempt += 1) {
  completed = await evaluate(`(() => {
    const sessionId =
      document.querySelector(".terminal-pane")?.dataset.sessionId;
    const blocks = JSON.parse(
      localStorage.getItem(
        "fz-terminal-command-blocks:" + sessionId
      ) || "[]"
    );
    return blocks.some(
      (block) =>
        block.command === ${JSON.stringify(command)} &&
        block.output.includes(${JSON.stringify(String(lineCount))})
    );
  })()`);
  if (completed) break;
  await delay(100);
}
if (!completed) throw new Error("Stress output did not finish in time");

await delay(800);
const { metrics } = await send("Performance.getMetrics");
const selected = Object.fromEntries(
  metrics
    .filter(({ name }) =>
      ["JSHeapUsedSize", "JSHeapTotalSize", "Nodes"].includes(name),
    )
    .map(({ name, value }) => [name, Math.round(value)]),
);
console.log(JSON.stringify({ ok: true, lineCount, renderer: selected }));
socket.close();
process.exit(0);
