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
const crypto = require("node:crypto");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFile, execFileSync, spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const pty = require("node-pty");
const {
  analyzeSshCommand,
  parseSshConnection,
  resolveRemoteCompletionDirectory,
} = require("./ssh-context.cjs");
const {
  foregroundStateFromLinuxProcStat,
  foregroundStateFromPsOutput,
} = require("./pty-context.cjs");

const sessions = new Map();
const browserViews = new Map();
const sshControlSockets = new Map();
const remoteDirectoryCache = new Map();
const TERMINAL_BACKLOG_LIMIT = 2_000_000;
const TERMINAL_BACKLOG_CHUNK_SIZE = 64 * 1024;
const REMOTE_DIRECTORY_CACHE_LIMIT = 128;
const FILE_EDITOR_LIMIT = 4 * 1024 * 1024;
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
let autoUpdater = null;
let browserSessionConfigured = false;
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

function getAutoUpdater() {
  if (!autoUpdater) {
    ({ autoUpdater } = require("electron-updater"));
  }
  return autoUpdater;
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
    await getAutoUpdater().checkForUpdates();
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
    await getAutoUpdater().downloadUpdate();
  } catch (error) {
    broadcastUpdateStatus({
      state: "error",
      message: updateErrorMessage(error),
    });
  }
  return updateStatus;
}

function configureAutoUpdater() {
  const updater = getAutoUpdater();
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;

  updater.on("checking-for-update", () => {
    broadcastUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a newer version…",
      progress: undefined,
    });
  });
  updater.on("update-available", (info) => {
    broadcastUpdateStatus({
      state: "available",
      availableVersion: info.version,
      message: `FZ Terminal ${info.version} was found and will download automatically.`,
      progress: undefined,
    });
  });
  updater.on("update-not-available", () => {
    broadcastUpdateStatus({
      state: "not-available",
      availableVersion: undefined,
      message: "You are using the latest version.",
      progress: undefined,
    });
  });
  updater.on("download-progress", (progress) => {
    broadcastUpdateStatus({
      state: "downloading",
      message: `Downloading update… ${Math.round(progress.percent)}%`,
      progress: Math.max(0, Math.min(100, progress.percent)),
    });
  });
  updater.on("update-downloaded", (info) => {
    broadcastUpdateStatus({
      state: "downloaded",
      availableVersion: info.version,
      message:
        "The update is ready and will install automatically when FZ Terminal closes.",
      progress: 100,
    });
  });
  updater.on("error", (error) => {
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
    return {
      id,
      backlog: existing.backlogChunks.join(""),
      pid: existing.process.pid,
    };
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
    backlogChunks: [],
    backlogLength: 0,
    cwd: workingDirectory,
    inputBuffer: "",
    observedConnection: null,
  };
  sessions.set(id, session);

  terminalProcess.onData((data) => {
    if (/Connection to .+ closed[.]?/i.test(data)) {
      session.observedConnection = null;
    }
    appendTerminalBacklog(session, data);
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

function trackSessionInput(session, data) {
  if (data.startsWith("\x1b")) return;
  for (const character of data) {
    if (character === "\r" || character === "\n") {
      const command = session.inputBuffer.trim();
      session.inputBuffer = "";
      if (/^(?:exit|logout)$/.test(command)) {
        session.observedConnection = null;
        continue;
      }
      const observed = analyzeSshCommand(
        command,
        sessionWorkingDirectory(session),
      );
      if (observed) session.observedConnection = observed.connection;
    } else if (character === "\x7f" || character === "\b") {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (character === "\x15" || character === "\x03") {
      session.inputBuffer = "";
    } else if (character === "\x04") {
      session.observedConnection = null;
    } else if (character.charCodeAt(0) >= 32) {
      session.inputBuffer += character;
      if (session.inputBuffer.length > 8192) {
        session.inputBuffer = session.inputBuffer.slice(-8192);
      }
    }
  }
}

function appendTerminalBacklog(session, data) {
  let offset = 0;
  const chunks = session.backlogChunks;
  const lastIndex = chunks.length - 1;
  if (lastIndex >= 0 && chunks[lastIndex].length < TERMINAL_BACKLOG_CHUNK_SIZE) {
    const appended = data.slice(
      0,
      TERMINAL_BACKLOG_CHUNK_SIZE - chunks[lastIndex].length,
    );
    chunks[lastIndex] += appended;
    session.backlogLength += appended.length;
    offset = appended.length;
  }
  while (offset < data.length) {
    const chunk = data.slice(offset, offset + TERMINAL_BACKLOG_CHUNK_SIZE);
    chunks.push(chunk);
    session.backlogLength += chunk.length;
    offset += chunk.length;
  }

  let excess = session.backlogLength - TERMINAL_BACKLOG_LIMIT;
  while (excess > 0 && chunks.length > 0) {
    const first = chunks[0];
    if (first.length <= excess) {
      chunks.shift();
      session.backlogLength -= first.length;
      excess -= first.length;
    } else {
      chunks[0] = first.slice(excess);
      session.backlogLength -= excess;
      excess = 0;
    }
  }
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
      let args = [];
      try {
        command = fs
          .readFileSync(`/proc/${pid}/comm`, "utf8")
          .trim()
          .toLowerCase();
      } catch {
        // The process may have exited between reading the child list and comm.
      }
      try {
        args = fs
          .readFileSync(`/proc/${pid}/cmdline`, "utf8")
          .split("\0")
          .filter(Boolean);
        argv0 = (args[0] || "").trim().toLowerCase();
      } catch {
        // argv[0] is optional context; comm remains the primary signal.
      }
      processes.push({ pid, command, argv0, args });
    }
  }
  return processes;
}

function getSessionForegroundState(session) {
  if (process.platform === "linux") {
    try {
      return foregroundStateFromLinuxProcStat(
        fs.readFileSync(`/proc/${session.process.pid}/stat`, "utf8"),
      );
    } catch {
      return undefined;
    }
  }
  if (["darwin", "freebsd", "openbsd"].includes(process.platform)) {
    try {
      return foregroundStateFromPsOutput(
        execFileSync(
          "ps",
          ["-o", "pgid=,tpgid=", "-p", String(session.process.pid)],
          { encoding: "utf8", timeout: 250 },
        ),
      );
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function getSessionContext(id) {
  const session = sessions.get(id);
  if (!session) return { exists: false, remote: false, multiplexer: null };
  const processes = getDescendantProcesses(session.process.pid);
  const commands = processes.flatMap(
    ({ command, argv0 }) =>
      [command, argv0]
        .filter(Boolean)
        .map((value) => path.basename(value)),
  );
  const processRemote = commands.some((command) =>
    /^(ssh|sshpass|sftp|mosh-client|telnet)$/.test(command),
  );
  const multiplexer = commands.some((command) => command === "screen")
    ? "screen"
    : commands.some((command) => command === "tmux")
      ? "tmux"
      : null;
  const sshProcess = processes.find(
    ({ command, argv0 }) =>
      path.basename(command) === "ssh" || path.basename(argv0) === "ssh",
  );
  const observedConnection = session.observedConnection || undefined;
  const fallbackConnection =
    process.platform === "linux" ? undefined : observedConnection;
  const connection = sshProcess
    ? parseSshConnection(
        sshProcess.args,
        sessionWorkingDirectory(session),
      )
    : fallbackConnection;
  const foreground = getSessionForegroundState(session);
  return {
    exists: true,
    remote: processRemote || Boolean(fallbackConnection),
    verified: Boolean(sshProcess),
    ...(foreground ? { busy: foreground.busy } : {}),
    multiplexer,
    ...(connection ? { connection } : {}),
  };
}

function sessionWorkingDirectory(session) {
  if (process.platform === "linux") {
    try {
      return fs.readlinkSync(`/proc/${session.process.pid}/cwd`);
    } catch {
      // Fall back to the session's startup directory.
    }
  }
  return session.cwd;
}

async function listSessionDirectory(
  id,
  requestedDirectory,
  currentDirectory,
) {
  const session = sessions.get(id);
  if (!session) return { cwd: "", entries: [] };
  const context = getSessionContext(id);
  if (context.remote) {
    if (!context.connection) {
      return { cwd: "", entries: [], remote: true };
    }
    const targetDirectory = resolveRemoteCompletionDirectory(
      currentDirectory,
      requestedDirectory,
    );
    return listRemoteFileDirectory(
      context.connection,
      targetDirectory,
    );
  }

  let cwd = sessionWorkingDirectory(session);
  if (
    process.platform !== "linux" &&
    currentDirectory &&
    path.isAbsolute(currentDirectory) &&
    fs.existsSync(currentDirectory)
  ) {
    cwd = currentDirectory;
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

function browserUserAgent() {
  const platform =
    process.platform === "win32"
      ? "Windows NT 10.0; Win64; x64"
      : process.platform === "darwin"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64";
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
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
  ensureBrowserSessionConfigured();
  const existing = browserViews.get(id);
  if (
    existing?.owner === event.sender &&
    !existing.view.webContents.isDestroyed()
  ) {
    existing.bounds = sanitizeBounds(bounds);
    existing.view.setBounds(existing.bounds);
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
  const entry = {
    view,
    owner: event.sender,
    bounds: sanitizeBounds(bounds),
    opacityStyleKey: null,
  };
  browserViews.set(id, entry);
  view.setBackgroundColor(
    process.platform === "linux" ? "#00000000" : "#101217",
  );
  view.setBounds(entry.bounds);
  view.setVisible(false);
  mainWindow.contentView.addChildView(view);
  view.webContents.setUserAgent(browserUserAgent());

  const update = () => sendBrowserState(id, entry);
  view.webContents.on("did-start-loading", update);
  view.webContents.on("did-stop-loading", update);
  view.webContents.on("did-finish-load", () => {
    void applyBrowserViewOpacity(entry);
  });
  view.webContents.on("did-navigate", update);
  view.webContents.on("did-navigate-in-page", update);
  view.webContents.on("page-title-updated", update);
  view.webContents.on("context-menu", (_contextEvent, params) => {
    if (!entry.owner.isDestroyed()) {
      entry.owner.send("browser:context-menu", {
        id,
        x: entry.bounds.x + params.x,
        y: entry.bounds.y + params.y,
      });
    }
  });
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

function ensureBrowserSessionConfigured() {
  if (browserSessionConfigured) return;
  session
    .fromPartition("persist:fz-browser")
    .setCertificateVerifyProc((request, callback) => {
      callback(isPrivateNetworkIp(request.hostname) ? 0 : -3);
    });
  browserSessionConfigured = true;
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

function normalizeRemoteConnection(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid SSH connection");
  }
  const host = String(value.host || "").trim();
  const user = String(value.user || "").trim();
  const identityFile = String(value.identityFile || "").trim();
  const port = Number(value.port || 22);
  if (
    !host ||
    host.length > 255 ||
    !/^[A-Za-z0-9._:[\]%-]+$/.test(host) ||
    user.length > 128 ||
    (user && !/^[A-Za-z0-9._-]+$/.test(user)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("Invalid SSH connection");
  }
  if (
    identityFile &&
    (identityFile.length > 2048 ||
      identityFile.includes("\0") ||
      !path.isAbsolute(identityFile))
  ) {
    throw new Error("SSH key path must be absolute");
  }
  return { host, user, port, identityFile };
}

function quoteRemoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function quoteSftpPath(value) {
  const requested = String(value);
  if (
    !requested ||
    requested.length > 2048 ||
    requested.includes("\0") ||
    /[\r\n]/.test(requested)
  ) {
    throw new Error("Invalid file transfer path");
  }
  return `"${requested.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function sshConnectionKey(connection) {
  return [
    connection.user,
    connection.host,
    connection.port,
    connection.identityFile,
  ].join("\0");
}

function sshConnectionTarget(connection) {
  return connection.user
    ? `${connection.user}@${connection.host}`
    : connection.host;
}

function sshControlOptions(connection) {
  if (process.platform === "win32") return [];
  const key = sshConnectionKey(connection);
  let entry = sshControlSockets.get(key);
  if (!entry) {
    const directory = path.join(app.getPath("userData"), "ssh-control");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
    entry = {
      path: path.join(directory, `${hash}.sock`),
      target: sshConnectionTarget(connection),
    };
    sshControlSockets.set(key, entry);
  }
  return [
    "-o",
    "ControlMaster=auto",
    "-o",
    "ControlPersist=600",
    "-o",
    `ControlPath=${entry.path}`,
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
  ];
}

function listRemoteFileDirectory(
  connectionValue,
  requestedDirectory,
  force = false,
) {
  const connection = normalizeRemoteConnection(connectionValue);
  const requested =
    typeof requestedDirectory === "string" && requestedDirectory.trim()
      ? requestedDirectory.trim()
      : "~";
  if (requested.length > 2048 || requested.includes("\0")) {
    return Promise.reject(new Error("Invalid remote directory"));
  }
  const cacheKey = `${sshConnectionKey(connection)}\0${requested}`;
  const cached = remoteDirectoryCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.savedAt < 30_000) {
    return Promise.resolve(cached.listing);
  }
  const remoteScript = [
    `requested=${quoteRemoteShell(requested)}`,
    'case "$requested" in "~") requested="$HOME";; "~/"*) requested="$HOME/${requested#~/}";; esac',
    'cd -- "$requested" || exit 72',
    "printf '%s\\0' \"$PWD\"",
    "find . -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0%s\\0%T@\\0' 2>/dev/null | head -c 8388608",
  ].join("; ");
  const target = sshConnectionTarget(connection);
  const args = [
    "-p",
    String(connection.port),
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    ...sshControlOptions(connection),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
    target,
    remoteScript,
  ];
  return new Promise((resolve, reject) => {
    execFile(
      "ssh",
      args,
      {
        encoding: "utf8",
        maxBuffer: 9 * 1024 * 1024,
        timeout: 15_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 400);
          reject(
            new Error(
              detail ||
                "SSH connection failed. Check your SSH agent, config, or key.",
            ),
          );
          return;
        }
        const fields = stdout.split("\0");
        const cwd = fields.shift() || requested;
        const entries = [];
        for (let index = 0; index + 3 < fields.length; index += 4) {
          const name = fields[index];
          if (!name) continue;
          const kind = fields[index + 1];
          const size = Number(fields[index + 2]);
          const modifiedSeconds = Number(fields[index + 3]);
          entries.push({
            name,
            path: cwd === "/" ? `/${name}` : `${cwd}/${name}`,
            directory: kind === "d",
            ...(Number.isFinite(size) ? { size } : {}),
            ...(Number.isFinite(modifiedSeconds)
              ? { modified: modifiedSeconds * 1000 }
              : {}),
          });
          if (entries.length >= 1000) break;
        }
        entries.sort(
          (left, right) =>
            Number(right.directory) - Number(left.directory) ||
            left.name.localeCompare(right.name),
        );
        const listing = { cwd, entries, remote: true };
        setRemoteDirectoryCache(cacheKey, {
          listing,
          savedAt: Date.now(),
        });
        resolve(listing);
      },
    );
  });
}

function setRemoteDirectoryCache(key, value) {
  remoteDirectoryCache.delete(key);
  remoteDirectoryCache.set(key, value);
  while (remoteDirectoryCache.size > REMOTE_DIRECTORY_CACHE_LIMIT) {
    const oldestKey = remoteDirectoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    remoteDirectoryCache.delete(oldestKey);
  }
}

function sftpConnectionArgs(connection) {
  return [
    "-b",
    "-",
    "-P",
    String(connection.port),
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    ...sshControlOptions(connection),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
    sshConnectionTarget(connection),
  ];
}

async function runSftpBatch(connection, command) {
  try {
    await runProcess("sftp", sftpConnectionArgs(connection), {
      input: Buffer.from(`${command}\n`),
      maxBuffer: 512 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    throw fileOperationError(error, "", "SFTP transfer failed");
  }
}

async function transferRemoteFileElevated(connection, request) {
  const password = normalizeSudoPassword(request.sudoPassword);
  const remoteTemporaryPath = `/tmp/.fz-terminal-${crypto.randomUUID()}`;
  const recursive = request.directory ? "-R " : "";
  const cleanup = async () => {
    try {
      await runRemoteOperation(
        connection,
        `rm -rf -- ${quoteRemoteShell(remoteTemporaryPath)}`,
        { timeout: 15_000 },
      );
    } catch {
      // A failed cleanup should not replace the original transfer error.
    }
  };
  try {
    if (request.direction === "upload") {
      const localSource = normalizeOperationPath(request.sourcePath, false);
      const remoteDirectory = normalizeOperationPath(
        request.targetDirectory,
        true,
      );
      const remoteTarget = path.posix.join(
        remoteDirectory,
        path.basename(localSource),
      );
      await runSftpBatch(
        connection,
        `put ${recursive}${quoteSftpPath(localSource)} ${quoteSftpPath(remoteTemporaryPath)}`,
      );
      const moveScript =
        'if [ -e "$2" ]; then printf FZ_ALREADY_EXISTS >&2; exit 73; fi; mv -- "$1" "$2"';
      const command = remoteSudoScript(
        `sh -c ${quoteRemoteShell(moveScript)} fz-terminal-sudo ${quoteRemoteShell(remoteTemporaryPath)} ${quoteRemoteShell(remoteTarget)}`,
      );
      await runRemoteOperation(connection, command, {
        input: localSudoInput(password),
        timeout: 120_000,
      });
    } else {
      const remoteSource = normalizeOperationPath(request.sourcePath, true);
      const localDirectory = normalizeOperationPath(
        request.targetDirectory,
        false,
      );
      const localTarget = path.join(
        localDirectory,
        path.posix.basename(remoteSource),
      );
      const copyScript =
        'cp -a -- "$1" "$2" && chown -R -- "$3" "$2"';
      const command = [
        'owner="$(id -u):$(id -g)"',
        remoteSudoScript(
          `sh -c ${quoteRemoteShell(copyScript)} fz-terminal-sudo ${quoteRemoteShell(remoteSource)} ${quoteRemoteShell(remoteTemporaryPath)} "$owner"`,
        ),
      ].join("; ");
      await runRemoteOperation(connection, command, {
        input: localSudoInput(password),
        timeout: 120_000,
      });
      await runSftpBatch(
        connection,
        `get ${recursive}${quoteSftpPath(remoteTemporaryPath)} ${quoteSftpPath(localTarget)}`,
      );
    }
    remoteDirectoryCache.clear();
    return {
      direction: request.direction,
      sourcePath: String(request.sourcePath),
      targetDirectory: String(request.targetDirectory),
    };
  } catch (error) {
    throw fileOperationError(error, "", "Privileged file transfer failed");
  } finally {
    await cleanup();
  }
}

async function transferRemoteFile(connectionValue, requestValue) {
  const connection = normalizeRemoteConnection(connectionValue);
  const request =
    requestValue && typeof requestValue === "object" ? requestValue : {};
  const direction = request.direction;
  if (direction !== "upload" && direction !== "download") {
    throw new Error("Invalid file transfer direction");
  }
  if (request.sudoPassword) {
    return transferRemoteFileElevated(connection, request);
  }
  const recursive = request.directory ? "-R " : "";
  const sourcePath = quoteSftpPath(request.sourcePath);
  const targetDirectory = quoteSftpPath(request.targetDirectory);
  const command =
    direction === "upload"
      ? `put ${recursive}${sourcePath} ${targetDirectory}`
      : `get ${recursive}${sourcePath} ${targetDirectory}`;
  await runSftpBatch(connection, command);
  remoteDirectoryCache.clear();
  return {
    direction,
    sourcePath: String(request.sourcePath),
    targetDirectory: String(request.targetDirectory),
  };
}

function remoteTerminalArgs(connectionValue, commandValue) {
  const connection = normalizeRemoteConnection(connectionValue);
  const command = String(commandValue || "");
  if (!command || command.length > 8192 || command.includes("\0")) {
    throw new Error("Invalid remote terminal command");
  }
  return [
    "-t",
    "-p",
    String(connection.port),
    ...sshControlOptions(connection),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
    sshConnectionTarget(connection),
    command,
  ];
}

function normalizeOperationPath(value, remote = false) {
  const requested = String(value || "").trim();
  if (
    !requested ||
    requested.length > 4096 ||
    requested.includes("\0") ||
    /[\r\n]/.test(requested)
  ) {
    throw new Error("Invalid file path");
  }
  return remote ? requested : resolveFileDirectory(requested);
}

function normalizeSudoPassword(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error("Invalid sudo password");
  }
  return value;
}

function fileOperationError(error, stderr, fallback = "File operation failed") {
  const raw = String(stderr || error?.message || fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
  if (/^FZ_(?:PERMISSION_REQUIRED|SUDO_FAILED):/.test(raw)) {
    return new Error(raw);
  }
  if (raw.includes("FZ_FILE_TOO_LARGE")) {
    return new Error("FZ_FILE_TOO_LARGE: File is larger than 4 MB");
  }
  if (raw.includes("FZ_BINARY_FILE")) {
    return new Error("FZ_BINARY_FILE: Binary files cannot open in the editor");
  }
  if (raw.includes("FZ_ALREADY_EXISTS")) {
    return new Error("FZ_ALREADY_EXISTS: Destination already exists");
  }
  if (
    error?.code === "EACCES" ||
    error?.code === "EPERM" ||
    /permission denied|operation not permitted|password is required/i.test(raw)
  ) {
    return new Error(`FZ_PERMISSION_REQUIRED: ${raw || fallback}`);
  }
  if (
    /incorrect password|authentication failure|sorry, try again|sudo:/i.test(
      raw,
    )
  ) {
    return new Error(`FZ_SUDO_FAILED: ${raw || "sudo failed"}`);
  }
  return new Error(raw || fallback);
}

function runProcess(
  executable,
  args,
  {
    input = Buffer.alloc(0),
    maxBuffer = FILE_EDITOR_LIMIT + 64 * 1024,
    timeout = 30_000,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    let stdoutSize = 0;
    let stderr = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("File operation timed out"));
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxBuffer) {
        child.kill();
        finish(new Error("FZ_FILE_TOO_LARGE"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 32_768) stderr += String(chunk);
    });
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(fileOperationError({ code }, stderr));
        return;
      }
      finish(null, {
        stdout: Buffer.concat(stdout),
        stderr,
      });
    });
    child.stdin.end(input);
  });
}

function localSudoInput(password, payload = Buffer.alloc(0)) {
  return Buffer.concat([
    Buffer.from(`${normalizeSudoPassword(password)}\n`),
    Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload)),
  ]);
}

function runLocalSudo(executable, args, password, payload, options) {
  if (process.platform === "win32") {
    return Promise.reject(
      new Error("FZ_PERMISSION_REQUIRED: sudo is unavailable on Windows"),
    );
  }
  return runProcess(
    "sudo",
    ["-S", "-k", "-p", "", "--", executable, ...args],
    {
      ...options,
      input: localSudoInput(password, payload),
    },
  );
}

function remoteOperationArgs(connection, script) {
  return [
    "-p",
    String(connection.port),
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    ...sshControlOptions(connection),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
    sshConnectionTarget(connection),
    script,
  ];
}

function runRemoteOperation(connection, script, options) {
  return runProcess("ssh", remoteOperationArgs(connection, script), options);
}

function remoteSudoScript(command) {
  return `sudo -S -k -p '' -- ${command}`;
}

function operationContext(requestValue) {
  const request =
    requestValue && typeof requestValue === "object" ? requestValue : {};
  const connection = request.connection
    ? normalizeRemoteConnection(request.connection)
    : null;
  return {
    request,
    connection,
    remote: Boolean(connection),
    sudoPassword: request.sudoPassword
      ? normalizeSudoPassword(request.sudoPassword)
      : "",
  };
}

async function createFileDirectory(requestValue) {
  const context = operationContext(requestValue);
  const targetPath = normalizeOperationPath(
    context.request.path,
    context.remote,
  );
  try {
    if (!context.remote) {
      if (context.sudoPassword) {
        await runLocalSudo(
          "mkdir",
          ["--", targetPath],
          context.sudoPassword,
        );
      } else {
        await fs.promises.mkdir(targetPath);
      }
    } else {
      const command = `mkdir -- ${quoteRemoteShell(targetPath)}`;
      await runRemoteOperation(
        context.connection,
        context.sudoPassword ? remoteSudoScript(command) : command,
        context.sudoPassword
          ? { input: localSudoInput(context.sudoPassword) }
          : undefined,
      );
      remoteDirectoryCache.clear();
    }
    return { path: targetPath };
  } catch (error) {
    throw fileOperationError(error);
  }
}

function validateDeletePath(targetPath, remote) {
  const normalized = remote ? targetPath.replace(/\/+$/, "") : targetPath;
  const root = remote ? "/" : path.parse(normalized).root;
  if (
    !normalized ||
    normalized === root ||
    normalized === "." ||
    normalized === ".." ||
    normalized === "~"
  ) {
    throw new Error("Refusing to delete a root directory");
  }
}

async function deleteFileEntry(requestValue) {
  const context = operationContext(requestValue);
  const targetPath = normalizeOperationPath(
    context.request.path,
    context.remote,
  );
  validateDeletePath(targetPath, context.remote);
  const directory = Boolean(context.request.directory);
  try {
    if (!context.remote) {
      if (context.sudoPassword) {
        await runLocalSudo(
          "rm",
          [...(directory ? ["-r"] : []), "--", targetPath],
          context.sudoPassword,
        );
      } else {
        await fs.promises.rm(targetPath, {
          recursive: directory,
          force: false,
        });
      }
    } else {
      const command = [
        "rm",
        ...(directory ? ["-r"] : []),
        "--",
        targetPath,
      ]
        .map(quoteRemoteShell)
        .join(" ");
      await runRemoteOperation(
        context.connection,
        context.sudoPassword ? remoteSudoScript(command) : command,
        context.sudoPassword
          ? { input: localSudoInput(context.sudoPassword) }
          : undefined,
      );
      remoteDirectoryCache.clear();
    }
    return { path: targetPath };
  } catch (error) {
    throw fileOperationError(error);
  }
}

async function moveFileEntry(requestValue) {
  const context = operationContext(requestValue);
  const sourcePath = normalizeOperationPath(
    context.request.sourcePath,
    context.remote,
  );
  const targetDirectory = normalizeOperationPath(
    context.request.targetDirectory,
    context.remote,
  );
  const targetPath = context.remote
    ? path.posix.join(targetDirectory, path.posix.basename(sourcePath))
    : path.join(targetDirectory, path.basename(sourcePath));
  if (sourcePath === targetPath) return { path: targetPath };
  try {
    if (!context.remote) {
      try {
        await fs.promises.access(targetPath);
        throw new Error("FZ_ALREADY_EXISTS");
      } catch (error) {
        if (error?.message === "FZ_ALREADY_EXISTS") throw error;
        if (error?.code !== "ENOENT") throw error;
      }
      if (context.sudoPassword) {
        await runLocalSudo(
          "mv",
          ["--", sourcePath, targetPath],
          context.sudoPassword,
        );
      } else {
        try {
          await fs.promises.rename(sourcePath, targetPath);
        } catch (error) {
          if (error?.code !== "EXDEV") throw error;
          await fs.promises.cp(sourcePath, targetPath, {
            recursive: true,
            errorOnExist: true,
          });
          await fs.promises.rm(sourcePath, {
            recursive: true,
            force: false,
          });
        }
      }
    } else {
      const quotedTarget = quoteRemoteShell(targetPath);
      const moveCommand = `if [ -e ${quotedTarget} ]; then printf FZ_ALREADY_EXISTS >&2; exit 73; fi; mv -- ${quoteRemoteShell(sourcePath)} ${quotedTarget}`;
      await runRemoteOperation(
        context.connection,
        context.sudoPassword
          ? remoteSudoScript(`sh -c ${quoteRemoteShell(moveCommand)}`)
          : moveCommand,
        context.sudoPassword
          ? { input: localSudoInput(context.sudoPassword) }
          : undefined,
      );
      remoteDirectoryCache.clear();
    }
    return { path: targetPath };
  } catch (error) {
    throw fileOperationError(error);
  }
}

function validateEditorBuffer(buffer) {
  if (buffer.length > FILE_EDITOR_LIMIT) {
    throw new Error("FZ_FILE_TOO_LARGE");
  }
  if (buffer.includes(0)) throw new Error("FZ_BINARY_FILE");
  return {
    content: buffer.toString("utf8"),
    size: buffer.length,
  };
}

async function readEditorFile(requestValue) {
  const context = operationContext(requestValue);
  const targetPath = normalizeOperationPath(
    context.request.path,
    context.remote,
  );
  try {
    let buffer;
    if (!context.remote) {
      if (context.sudoPassword) {
        const result = await runLocalSudo(
          "cat",
          ["--", targetPath],
          context.sudoPassword,
        );
        buffer = result.stdout;
      } else {
        const stats = await fs.promises.stat(targetPath);
        if (stats.size > FILE_EDITOR_LIMIT) {
          throw new Error("FZ_FILE_TOO_LARGE");
        }
        buffer = await fs.promises.readFile(targetPath);
      }
    } else {
      const command = `cat -- ${quoteRemoteShell(targetPath)}`;
      const result = await runRemoteOperation(
        context.connection,
        context.sudoPassword ? remoteSudoScript(command) : command,
        context.sudoPassword
          ? {
              input: localSudoInput(context.sudoPassword),
              maxBuffer: FILE_EDITOR_LIMIT + 1,
            }
          : { maxBuffer: FILE_EDITOR_LIMIT + 1 },
      );
      buffer = result.stdout;
    }
    return { path: targetPath, ...validateEditorBuffer(buffer) };
  } catch (error) {
    throw fileOperationError(error);
  }
}

async function writeEditorFile(requestValue) {
  const context = operationContext(requestValue);
  const targetPath = normalizeOperationPath(
    context.request.path,
    context.remote,
  );
  const content = String(context.request.content ?? "");
  const payload = Buffer.from(content, "utf8");
  if (payload.length > FILE_EDITOR_LIMIT) {
    throw new Error("FZ_FILE_TOO_LARGE: File is larger than 4 MB");
  }
  try {
    if (!context.remote) {
      if (context.sudoPassword) {
        await runLocalSudo(
          "sh",
          [
            "-c",
            'tee -- "$1" > /dev/null',
            "fz-terminal-write",
            targetPath,
          ],
          context.sudoPassword,
          payload,
          { maxBuffer: 64 * 1024 },
        );
      } else {
        await fs.promises.writeFile(targetPath, payload);
      }
    } else {
      const writeCommand = `tee -- ${quoteRemoteShell(targetPath)} > /dev/null`;
      await runRemoteOperation(
        context.connection,
        context.sudoPassword
          ? remoteSudoScript(`sh -c ${quoteRemoteShell(writeCommand)}`)
          : writeCommand,
        {
          input: context.sudoPassword
            ? localSudoInput(context.sudoPassword, payload)
            : payload,
          maxBuffer: 64 * 1024,
        },
      );
      remoteDirectoryCache.clear();
    }
    return { path: targetPath, size: payload.length };
  } catch (error) {
    throw fileOperationError(error);
  }
}

async function openFileExternally(filePathValue) {
  const targetPath = normalizeOperationPath(filePathValue, false);
  const stats = await fs.promises.stat(targetPath);
  if (!stats.isFile()) throw new Error("Only files can open externally");
  const error = await shell.openPath(targetPath);
  if (error) throw new Error(error);
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
    if (typeof data !== "string") return;
    const session = sessions.get(id);
    if (!session) return;
    trackSessionInput(session, data);
    session.process.write(data);
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
  ipcMain.handle("pty:list-directory", (_event, id, directory, currentDirectory) =>
    listSessionDirectory(id, directory, currentDirectory),
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
    if (entry?.owner === event.sender) {
      entry.bounds = sanitizeBounds(bounds);
      entry.view.setBounds(entry.bounds);
    }
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
  ipcMain.handle(
    "files:list-remote-directory",
    (_event, connection, directory, force) =>
      listRemoteFileDirectory(connection, directory, Boolean(force)),
  );
  ipcMain.handle("files:transfer", (_event, connection, request) =>
    transferRemoteFile(connection, request),
  );
  ipcMain.handle(
    "files:remote-terminal-args",
    (_event, connection, command) =>
      remoteTerminalArgs(connection, command),
  );
  ipcMain.handle("files:create-directory", (_event, request) =>
    createFileDirectory(request),
  );
  ipcMain.handle("files:delete-entry", (_event, request) =>
    deleteFileEntry(request),
  );
  ipcMain.handle("files:move-entry", (_event, request) =>
    moveFileEntry(request),
  );
  ipcMain.handle("files:read-file", (_event, request) =>
    readEditorFile(request),
  );
  ipcMain.handle("files:write-file", (_event, request) =>
    writeEditorFile(request),
  );
  ipcMain.handle("files:open-external", (_event, filePath) =>
    openFileExternally(filePath),
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
      getAutoUpdater().quitAndInstall(false, true);
    }
  });
  ipcMain.on("updates:open-releases", () => {
    void shell.openExternal(RELEASES_URL);
  });

  if (app.isPackaged) configureAutoUpdater();
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
  for (const entry of sshControlSockets.values()) {
    execFile(
      "ssh",
      ["-S", entry.path, "-O", "exit", entry.target],
      { timeout: 2_000, windowsHide: true },
      () => undefined,
    );
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || isQuitting) app.quit();
});
