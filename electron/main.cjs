const {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  ipcMain,
  session,
  shell,
} = require("electron");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { autoUpdater } = require("electron-updater");
const pty = require("node-pty");

const sessions = new Map();
const browserViews = new Map();
const TERMINAL_BACKLOG_LIMIT = 8_000_000;
const PROFILE_BACKUP_NAME = "profile.json";
const PROFILE_ENTRY_PREFIX = "fz-terminal-";
const PROFILE_BACKUP_LIMIT = 24 * 1024 * 1024;
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1_000;
const RELEASES_URL =
  "https://github.com/furzich2015/FZ_Terminal/releases";
let mainWindow = null;
let isQuitting = false;
let updateCheckTimer = null;
let updateCheckInFlight = false;
let systemFontCache = null;
let currentWindowOpacity = 1;
let updateStatus = {
  state: app.isPackaged ? "idle" : "development",
  currentVersion: app.getVersion(),
  message: app.isPackaged
    ? "Ready to check for updates."
    : "Update checks are available in installed builds.",
};

const defaultUserDataPath = app.getPath("userData");
const canonicalUserDataPath = path.join(app.getPath("appData"), "fz-terminal");
app.setPath("userData", canonicalUserDataPath);
const importedProfileFrom = migrateLegacyChromiumProfile(
  canonicalUserDataPath,
  [defaultUserDataPath],
);

if (/^\d{2,5}$/.test(process.env.FZ_CDP_PORT || "")) {
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.FZ_CDP_PORT,
  );
}

function directoryHasProfileStorage(directory) {
  const levelDbDirectory = path.join(directory, "Local Storage", "leveldb");
  try {
    return (
      fs.existsSync(path.join(directory, PROFILE_BACKUP_NAME)) ||
      fs
        .readdirSync(levelDbDirectory, { withFileTypes: true })
        .some((entry) => entry.isFile())
    );
  } catch {
    return false;
  }
}

function migrateLegacyChromiumProfile(targetDirectory, candidates) {
  if (directoryHasProfileStorage(targetDirectory)) return null;
  for (const candidate of candidates) {
    if (
      !candidate ||
      path.resolve(candidate) === path.resolve(targetDirectory) ||
      !directoryHasProfileStorage(candidate)
    ) {
      continue;
    }
    fs.mkdirSync(targetDirectory, { recursive: true });
    for (const entry of [
      "Local Storage",
      "Session Storage",
      "IndexedDB",
      PROFILE_BACKUP_NAME,
    ]) {
      const source = path.join(candidate, entry);
      const destination = path.join(targetDirectory, entry);
      if (fs.existsSync(source) && !fs.existsSync(destination)) {
        fs.cpSync(source, destination, { recursive: true });
      }
    }
    return candidate;
  }
  return null;
}

function runFontCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 12_000,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

async function listSystemFonts() {
  if (systemFontCache) return systemFontCache;
  const bundled = ["Cascadia Code", "DM Mono", "IBM Plex Mono"];
  let output = "";
  try {
    if (process.platform === "win32") {
      output = await runFontCommand("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name",
      ]);
    } else if (process.platform === "darwin") {
      output = await runFontCommand("system_profiler", [
        "SPFontsDataType",
        "-detailLevel",
        "mini",
      ]);
    } else {
      output = await runFontCommand("fc-list", [
        "--format=%{family}\\n",
      ]);
    }
  } catch {
    output = "";
  }

  const discovered =
    process.platform === "darwin"
      ? [...output.matchAll(/^\s*(?:Family|Full Name):\s*(.+)$/gm)].map(
          (match) => match[1],
        )
      : output.split(/\r?\n/);
  systemFontCache = [
    ...new Set(
      [...bundled, ...discovered]
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(
          (value) =>
            value.length > 0 &&
            value.length <= 128 &&
            !/[\u0000-\u001f]/.test(value),
        ),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
  return systemFontCache;
}

function normalizeProfileEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid profile data");
  }
  const entries = {};
  let size = 0;
  for (const [key, entryValue] of Object.entries(value)) {
    if (
      typeof key !== "string" ||
      !key.startsWith(PROFILE_ENTRY_PREFIX) ||
      typeof entryValue !== "string"
    ) {
      throw new Error("Invalid profile entry");
    }
    size += Buffer.byteLength(key) + Buffer.byteLength(entryValue);
    if (size > PROFILE_BACKUP_LIMIT) {
      throw new Error("Profile backup is too large");
    }
    entries[key] = entryValue;
  }
  return entries;
}

function getProfileBackupPath() {
  return path.join(app.getPath("userData"), PROFILE_BACKUP_NAME);
}

function loadProfileBackup() {
  try {
    const payload = JSON.parse(fs.readFileSync(getProfileBackupPath(), "utf8"));
    return {
      version: 1,
      savedAt:
        typeof payload.savedAt === "string" ? payload.savedAt : undefined,
      entries: normalizeProfileEntries(payload.entries),
    };
  } catch {
    return { version: 1, entries: {} };
  }
}

function saveProfileBackup(value) {
  const entries = normalizeProfileEntries(value);
  const savedAt = new Date().toISOString();
  const target = getProfileBackupPath();
  const temporary = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporary,
    JSON.stringify({ version: 1, savedAt, entries }, null, 2),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  fs.renameSync(temporary, target);
  return { savedAt };
}

function getProfileInfo() {
  const backup = loadProfileBackup();
  return {
    userDataPath: app.getPath("userData"),
    backupPath: getProfileBackupPath(),
    savedAt: backup.savedAt,
    importedFrom: importedProfileFrom,
  };
}

function broadcastUpdateStatus(patch) {
  updateStatus = {
    ...updateStatus,
    ...patch,
    currentVersion: app.getVersion(),
  };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("updates:status", updateStatus);
    }
  }
  return updateStatus;
}

function updateErrorMessage(error) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "The update service is temporarily unavailable.";
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    return broadcastUpdateStatus({
      state: "development",
      message: "Update checks are available in installed builds.",
    });
  }
  if (
    updateCheckInFlight ||
    updateStatus.state === "checking" ||
    updateStatus.state === "downloading" ||
    updateStatus.state === "downloaded"
  ) {
    return updateStatus;
  }
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    broadcastUpdateStatus({
      state: "error",
      message: updateErrorMessage(error),
    });
  } finally {
    updateCheckInFlight = false;
  }
  return updateStatus;
}

async function downloadUpdate() {
  if (!app.isPackaged || updateStatus.state !== "available") {
    return updateStatus;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    broadcastUpdateStatus({
      state: "error",
      message: updateErrorMessage(error),
    });
  }
  return updateStatus;
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    broadcastUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a newer version…",
      progress: undefined,
    });
  });
  autoUpdater.on("update-available", (info) => {
    broadcastUpdateStatus({
      state: "available",
      availableVersion: info.version,
      message: `FZ Terminal ${info.version} was found and will download automatically.`,
      progress: undefined,
    });
  });
  autoUpdater.on("update-not-available", () => {
    broadcastUpdateStatus({
      state: "not-available",
      availableVersion: undefined,
      message: "You are using the latest version.",
      progress: undefined,
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    broadcastUpdateStatus({
      state: "downloading",
      message: `Downloading update… ${Math.round(progress.percent)}%`,
      progress: Math.max(0, Math.min(100, progress.percent)),
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    broadcastUpdateStatus({
      state: "downloaded",
      availableVersion: info.version,
      message:
        "The update is ready and will install automatically when FZ Terminal closes.",
      progress: 100,
    });
  });
  autoUpdater.on("error", (error) => {
    broadcastUpdateStatus({
      state: "error",
      message: updateErrorMessage(error),
      progress: undefined,
    });
  });
}

function resolveShell(requestedShell) {
  if (requestedShell && path.isAbsolute(requestedShell) && fs.existsSync(requestedShell)) {
    return requestedShell;
  }
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function resolveWorkingDirectory(requestedDirectory) {
  if (
    requestedDirectory &&
    path.isAbsolute(requestedDirectory) &&
    fs.existsSync(requestedDirectory)
  ) {
    return requestedDirectory;
  }
  return os.homedir();
}

function createTerminalSession(event, options) {
  const { id, cols = 80, rows = 24, cwd, shell: requestedShell } = options;
  const terminalCols = Math.max(2, Math.floor(cols));
  const terminalRows = Math.max(1, Math.floor(rows));
  const existing = sessions.get(id);
  if (existing) {
    existing.owner = event.sender;
    try {
      existing.process.resize(terminalCols, terminalRows);
    } catch {
      // The shell may have exited while its tab was inactive.
    }
    return { id, backlog: existing.backlog, pid: existing.process.pid };
  }

  const executable = resolveShell(requestedShell);
  const loginShells = new Set(["bash", "dash", "fish", "ksh", "sh", "zsh"]);
  const shellName = path.basename(executable).toLowerCase();
  const args =
    process.platform !== "win32" && loginShells.has(shellName) ? ["-l"] : [];
  const processEnv = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLICOLOR: "1",
    FORCE_COLOR: "1",
    LESS: process.env.LESS || "-RX",
    COLUMNS: String(terminalCols),
    LINES: String(terminalRows),
  };
  const workingDirectory = resolveWorkingDirectory(cwd);

  const terminalProcess = pty.spawn(executable, args, {
    name: "xterm-256color",
    cols: terminalCols,
    rows: terminalRows,
    cwd: workingDirectory,
    env: processEnv,
    useConpty: process.platform === "win32",
  });

  const session = {
    process: terminalProcess,
    owner: event.sender,
    backlog: "",
    cwd: workingDirectory,
  };
  sessions.set(id, session);

  terminalProcess.onData((data) => {
    session.backlog = (session.backlog + data).slice(-TERMINAL_BACKLOG_LIMIT);
    if (!session.owner.isDestroyed()) {
      session.owner.send("pty:data", { id, data });
    }
  });

  terminalProcess.onExit(({ exitCode, signal }) => {
    if (!session.owner.isDestroyed()) {
      session.owner.send("pty:exit", { id, exitCode, signal });
    }
    sessions.delete(id);
  });

  return { id, backlog: "", pid: terminalProcess.pid };
}

function killSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try {
    session.process.kill();
  } catch {
    // The shell may already have exited.
  }
}

function getDescendantProcesses(rootPid) {
  if (process.platform !== "linux") return [];
  const processes = [];
  const queue = [rootPid];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const parentPid = queue.shift();
    let children = [];
    try {
      children = fs
        .readFileSync(
          `/proc/${parentPid}/task/${parentPid}/children`,
          "utf8",
        )
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number);
    } catch {
      continue;
    }
    for (const pid of children) {
      if (!Number.isFinite(pid) || visited.has(pid)) continue;
      visited.add(pid);
      queue.push(pid);
      let command = "";
      let argv0 = "";
      try {
        command = fs
          .readFileSync(`/proc/${pid}/comm`, "utf8")
          .trim()
          .toLowerCase();
      } catch {
        // The process may have exited between reading the child list and comm.
      }
      try {
        argv0 = fs
          .readFileSync(`/proc/${pid}/cmdline`, "utf8")
          .split("\0")[0]
          .trim()
          .toLowerCase();
      } catch {
        // argv[0] is optional context; comm remains the primary signal.
      }
      processes.push({ pid, command, argv0 });
    }
  }
  return processes;
}

function getSessionContext(id) {
  const session = sessions.get(id);
  if (!session) return { remote: false, multiplexer: null };
  const commands = getDescendantProcesses(session.process.pid).flatMap(
    ({ command, argv0 }) =>
      [command, argv0]
        .filter(Boolean)
        .map((value) => path.basename(value)),
  );
  const remote = commands.some((command) =>
    /^(ssh|sshpass|sftp|mosh-client|telnet)$/.test(command),
  );
  const multiplexer = commands.some((command) => command === "screen")
    ? "screen"
    : commands.some((command) => command === "tmux")
      ? "tmux"
      : null;
  return { remote, multiplexer };
}

function listSessionDirectory(id, requestedDirectory) {
  const session = sessions.get(id);
  if (!session) return { cwd: "", entries: [] };
  const context = getSessionContext(id);
  if (context.remote) return { cwd: "", entries: [], remote: true };

  let cwd = session.cwd;
  if (process.platform === "linux") {
    try {
      cwd = fs.readlinkSync(`/proc/${session.process.pid}/cwd`);
    } catch {
      // Fall back to the session's startup directory.
    }
  }

  let targetDirectory = cwd;
  if (requestedDirectory) {
    if (requestedDirectory === "~") {
      targetDirectory = os.homedir();
    } else if (requestedDirectory.startsWith("~/")) {
      targetDirectory = path.join(os.homedir(), requestedDirectory.slice(2));
    } else {
      targetDirectory = path.resolve(cwd, requestedDirectory);
    }
  }

  try {
    const entries = fs
      .readdirSync(targetDirectory, { withFileTypes: true })
      .map((entry) => ({
        name: entry.name,
        directory: entry.isDirectory(),
      }))
      .sort(
        (left, right) =>
          Number(right.directory) - Number(left.directory) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, 500);
    return { cwd: targetDirectory, entries };
  } catch {
    return { cwd: targetDirectory, entries: [] };
  }
}

function resolveBrowserUrl(value) {
  const requested = typeof value === "string" ? value.trim() : "";
  if (!requested) return "https://www.google.com/";
  if (/\s/.test(requested)) {
    return `https://www.google.com/search?q=${encodeURIComponent(requested)}`;
  }
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(requested)
    ? requested
    : `https://${requested}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS pages can open in a browser tab");
  }
  return url.href;
}

function sanitizeBounds(bounds) {
  const value = bounds && typeof bounds === "object" ? bounds : {};
  return {
    x: Math.max(0, Math.floor(Number(value.x) || 0)),
    y: Math.max(0, Math.floor(Number(value.y) || 0)),
    width: Math.max(1, Math.floor(Number(value.width) || 1)),
    height: Math.max(1, Math.floor(Number(value.height) || 1)),
  };
}

function sendBrowserState(id, entry, error) {
  const { owner, view } = entry;
  if (owner.isDestroyed() || view.webContents.isDestroyed()) return;
  owner.send("browser:state", {
    id,
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    loading: view.webContents.isLoading(),
    canGoBack: view.webContents.navigationHistory.canGoBack(),
    canGoForward: view.webContents.navigationHistory.canGoForward(),
    ...(error ? { error } : {}),
  });
}

async function applyBrowserViewOpacity(entry) {
  if (
    process.platform !== "linux" ||
    entry.view.webContents.isDestroyed()
  ) {
    return;
  }
  if (entry.opacityStyleKey) {
    try {
      await entry.view.webContents.removeInsertedCSS(entry.opacityStyleKey);
    } catch {
      // A navigation may discard the previous document before CSS is removed.
    }
  }
  try {
    entry.opacityStyleKey = await entry.view.webContents.insertCSS(
      `:root { opacity: ${currentWindowOpacity} !important; }`,
      { cssOrigin: "user" },
    );
  } catch {
    entry.opacityStyleKey = null;
  }
}

function destroyBrowserView(id, owner) {
  const entry = browserViews.get(id);
  if (!entry || (owner && entry.owner !== owner)) return;
  browserViews.delete(id);
  try {
    mainWindow?.contentView.removeChildView(entry.view);
  } catch {
    // The parent window may already be closing.
  }
  if (!entry.view.webContents.isDestroyed()) {
    entry.view.webContents.close();
  }
}

function createBrowserView(event, id, requestedUrl, bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const existing = browserViews.get(id);
  if (
    existing?.owner === event.sender &&
    !existing.view.webContents.isDestroyed()
  ) {
    existing.view.setBounds(sanitizeBounds(bounds));
    sendBrowserState(id, existing);
    return;
  }
  destroyBrowserView(id);

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      partition: "persist:fz-browser",
    },
  });
  const entry = { view, owner: event.sender, opacityStyleKey: null };
  browserViews.set(id, entry);
  view.setBackgroundColor(
    process.platform === "linux" ? "#00000000" : "#101217",
  );
  view.setBounds(sanitizeBounds(bounds));
  mainWindow.contentView.addChildView(view);

  const update = () => sendBrowserState(id, entry);
  view.webContents.on("did-start-loading", update);
  view.webContents.on("did-stop-loading", update);
  view.webContents.on("did-finish-load", () => {
    void applyBrowserViewOpacity(entry);
  });
  view.webContents.on("did-navigate", update);
  view.webContents.on("did-navigate-in-page", update);
  view.webContents.on("page-title-updated", update);
  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (errorCode !== -3) sendBrowserState(id, entry, errorDescription);
    },
  );
  view.webContents.on("will-navigate", (navigationEvent, url) => {
    try {
      resolveBrowserUrl(url);
    } catch {
      navigationEvent.preventDefault();
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void view.webContents.loadURL(resolveBrowserUrl(url));
    } catch {
      // Untrusted pages must not invoke file:, shell:, or custom URI handlers.
    }
    return { action: "deny" };
  });

  void view.webContents
    .loadURL(resolveBrowserUrl(requestedUrl))
    .catch((error) => sendBrowserState(id, entry, error.message));
}

function resolveFileDirectory(requestedDirectory) {
  if (!requestedDirectory || requestedDirectory === "~") return os.homedir();
  if (requestedDirectory.startsWith("~/")) {
    return path.resolve(os.homedir(), requestedDirectory.slice(2));
  }
  return path.resolve(requestedDirectory);
}

function listFileDirectory(requestedDirectory) {
  const targetDirectory = resolveFileDirectory(requestedDirectory);
  const entries = fs
    .readdirSync(targetDirectory, { withFileTypes: true })
    .slice(0, 1000)
    .map((entry) => {
      const entryPath = path.join(targetDirectory, entry.name);
      let size;
      let modified;
      try {
        const stats = fs.statSync(entryPath);
        size = stats.size;
        modified = stats.mtimeMs;
      } catch {
        // Keep inaccessible entries visible without metadata.
      }
      return {
        name: entry.name,
        path: entryPath,
        directory: entry.isDirectory(),
        size,
        modified,
      };
    })
    .sort(
      (left, right) =>
        Number(right.directory) - Number(left.directory) ||
        left.name.localeCompare(right.name),
    );
  return { cwd: targetDirectory, entries };
}

function createWindow() {
  const devUrl = process.env.FZ_DEV_SERVER_URL;
  const productionUrl = pathToFileURL(
    path.join(__dirname, "..", "dist", "index.html"),
  ).href;
  const allowedUrl = devUrl || productionUrl;

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 580,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "FZ Terminal",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed =
      devUrl
        ? new URL(url).origin === new URL(allowedUrl).origin
        : url === allowedUrl;
    if (!allowed) event.preventDefault();
  });

  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized", false);
  });
  mainWindow.on("closed", () => {
    for (const id of browserViews.keys()) destroyBrowserView(id);
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  session
    .fromPartition("persist:fz-browser")
    .setCertificateVerifyProc((request, callback) => {
      callback(isPrivateNetworkIp(request.hostname) ? 0 : -3);
    });

  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.on("window:set-opacity", (_event, value) => {
    if (!mainWindow || !Number.isFinite(value)) return;
    const opacity = Math.min(1, Math.max(0.2, Number(value)));
    currentWindowOpacity = opacity;
    mainWindow.setBackgroundColor("#00000000");
    mainWindow.setOpacity(opacity);
    for (const entry of browserViews.values()) {
      void applyBrowserViewOpacity(entry);
    }
  });
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("fonts:list", listSystemFonts);

  ipcMain.handle("pty:create", createTerminalSession);
  ipcMain.on("pty:input", (_event, { id, data }) => {
    if (typeof data === "string") sessions.get(id)?.process.write(data);
  });
  ipcMain.on("pty:resize", (_event, { id, cols, rows }) => {
    const session = sessions.get(id);
    if (!session) return;
    try {
      session.process.resize(Math.max(2, cols), Math.max(1, rows));
    } catch {
      // Resize events can race with a shell exit.
    }
  });
  ipcMain.on("pty:kill", (_event, id) => killSession(id));
  ipcMain.handle("pty:list-directory", (_event, id, directory) =>
    listSessionDirectory(id, directory),
  );
  ipcMain.handle("pty:get-context", (_event, id) => getSessionContext(id));

  ipcMain.handle("clipboard:read", () => clipboard.readText());
  ipcMain.handle("clipboard:write", (_event, text) => {
    if (typeof text === "string") clipboard.writeText(text);
  });

  ipcMain.handle("browser:create", (event, { id, url, bounds }) => {
    createBrowserView(event, id, url, bounds);
  });
  ipcMain.on("browser:set-bounds", (event, { id, bounds }) => {
    const entry = browserViews.get(id);
    if (entry?.owner === event.sender) entry.view.setBounds(sanitizeBounds(bounds));
  });
  ipcMain.on("browser:navigate", (event, { id, url }) => {
    const entry = browserViews.get(id);
    if (entry?.owner !== event.sender) return;
    try {
      void entry.view.webContents.loadURL(resolveBrowserUrl(url));
    } catch (error) {
      sendBrowserState(id, entry, error.message);
    }
  });
  ipcMain.on("browser:back", (event, id) => {
    const entry = browserViews.get(id);
    if (
      entry?.owner === event.sender &&
      entry.view.webContents.navigationHistory.canGoBack()
    ) {
      entry.view.webContents.navigationHistory.goBack();
    }
  });
  ipcMain.on("browser:forward", (event, id) => {
    const entry = browserViews.get(id);
    if (
      entry?.owner === event.sender &&
      entry.view.webContents.navigationHistory.canGoForward()
    ) {
      entry.view.webContents.navigationHistory.goForward();
    }
  });
  ipcMain.on("browser:reload", (event, id) => {
    const entry = browserViews.get(id);
    if (entry?.owner === event.sender) entry.view.webContents.reload();
  });
  ipcMain.on("browser:set-visible", (event, { id, visible }) => {
    const entry = browserViews.get(id);
    if (entry?.owner === event.sender) entry.view.setVisible(Boolean(visible));
  });
  ipcMain.on("browser:destroy", (event, id) => {
    destroyBrowserView(id, event.sender);
  });

  ipcMain.handle("files:home", () => os.homedir());
  ipcMain.handle("files:list-directory", (_event, directory) =>
    listFileDirectory(directory),
  );

  ipcMain.handle("profile:load", loadProfileBackup);
  ipcMain.handle("profile:save", (_event, entries) =>
    saveProfileBackup(entries),
  );
  ipcMain.handle("profile:info", getProfileInfo);

  ipcMain.handle("updates:get-status", () => updateStatus);
  ipcMain.handle("updates:check", checkForUpdates);
  ipcMain.handle("updates:download", downloadUpdate);
  ipcMain.on("updates:install", () => {
    if (app.isPackaged && updateStatus.state === "downloaded") {
      autoUpdater.quitAndInstall(false, true);
    }
  });
  ipcMain.on("updates:open-releases", () => {
    void shell.openExternal(RELEASES_URL);
  });

  configureAutoUpdater();
  createWindow();
  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates();
    }, 8_000);
    updateCheckTimer = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function isPrivateNetworkIp(hostname) {
  const normalized = String(hostname || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .toLowerCase();
  const version = net.isIP(normalized);
  if (version === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  return (
    version === 6 &&
    (normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb"))
  );
}

app.on("before-quit", () => {
  isQuitting = true;
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  for (const id of sessions.keys()) killSession(id);
  for (const id of browserViews.keys()) destroyBrowserView(id);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || isQuitting) app.quit();
});
