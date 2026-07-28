import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { App } from "./App";
import { bootstrapProfile, startProfileSync } from "./lib/profileSync";

async function startApplication() {
  await bootstrapProfile();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  startProfileSync();
}

void startApplication();
