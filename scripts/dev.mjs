import { spawn } from "node:child_process";
import electronPath from "electron";
import { createServer } from "vite";

const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});

await server.listen();

const electron = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    FZ_DEV_SERVER_URL: "http://127.0.0.1:5173",
  },
});

const close = async (code = 0) => {
  await server.close();
  process.exit(code);
};

electron.on("exit", (code) => void close(code ?? 0));
process.on("SIGINT", () => electron.kill("SIGINT"));
process.on("SIGTERM", () => electron.kill("SIGTERM"));
