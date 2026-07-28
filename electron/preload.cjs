const { contextBridge, ipcRenderer } = require("electron");

const isSessionId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const isSafeText = (value, limit = 4096) =>
  typeof value === "string" && value.length <= limit && !value.includes("\0");
const isProfileEntryKey = (value) =>
  typeof value === "string" &&
  value.startsWith("fz-terminal-") &&
  value.length <= 256;
const sanitizeProfileEntries = (entries) => {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("Invalid profile data");
  }
  const result = {};
  let size = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (!isProfileEntryKey(key) || typeof value !== "string") {
      throw new Error("Invalid profile entry");
    }
    size += key.length + value.length;
    if (size > 24 * 1024 * 1024) {
      throw new Error("Profile backup is too large");
    }
    result[key] = value;
  }
  return result;
};
const sanitizeBounds = (bounds) => {
  if (
    !bounds ||
    !["x", "y", "width", "height"].every((key) =>
      Number.isFinite(bounds[key]),
    )
  ) {
    throw new Error("Invalid browser bounds");
  }
  return bounds;
};

contextBridge.exposeInMainWorld("fzTerminal", {
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximized: (callback) => {
      const listener = (_event, value) => callback(Boolean(value));
      ipcRenderer.on("window:maximized", listener);
      return () => ipcRenderer.removeListener("window:maximized", listener);
    },
  },
  pty: {
    create: (options) => {
      if (!isSessionId(options?.id)) throw new Error("Invalid session id");
      return ipcRenderer.invoke("pty:create", options);
    },
    write: (id, data) => {
      if (isSessionId(id) && typeof data === "string") {
        ipcRenderer.send("pty:input", { id, data });
      }
    },
    resize: (id, cols, rows) => {
      if (isSessionId(id) && Number.isFinite(cols) && Number.isFinite(rows)) {
        ipcRenderer.send("pty:resize", { id, cols, rows });
      }
    },
    kill: (id) => {
      if (isSessionId(id)) ipcRenderer.send("pty:kill", id);
    },
    listDirectory: (id, directory) => {
      if (!isSessionId(id)) throw new Error("Invalid session id");
      if (
        directory !== undefined &&
        (typeof directory !== "string" ||
          directory.length > 2048 ||
          directory.includes("\0"))
      ) {
        throw new Error("Invalid directory");
      }
      return ipcRenderer.invoke("pty:list-directory", id, directory);
    },
    getContext: (id) => {
      if (!isSessionId(id)) throw new Error("Invalid session id");
      return ipcRenderer.invoke("pty:get-context", id);
    },
    onData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("pty:data", listener);
      return () => ipcRenderer.removeListener("pty:data", listener);
    },
    onExit: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("pty:exit", listener);
      return () => ipcRenderer.removeListener("pty:exit", listener);
    },
  },
  clipboard: {
    readText: () => ipcRenderer.invoke("clipboard:read"),
    writeText: (text) => ipcRenderer.send("clipboard:write", text),
  },
  browser: {
    create: (id, url, bounds) => {
      if (!isSessionId(id) || !isSafeText(url)) {
        throw new Error("Invalid browser tab");
      }
      return ipcRenderer.invoke("browser:create", {
        id,
        url,
        bounds: sanitizeBounds(bounds),
      });
    },
    setBounds: (id, bounds) => {
      if (isSessionId(id)) {
        ipcRenderer.send("browser:set-bounds", {
          id,
          bounds: sanitizeBounds(bounds),
        });
      }
    },
    navigate: (id, url) => {
      if (isSessionId(id) && isSafeText(url)) {
        ipcRenderer.send("browser:navigate", { id, url });
      }
    },
    back: (id) => {
      if (isSessionId(id)) ipcRenderer.send("browser:back", id);
    },
    forward: (id) => {
      if (isSessionId(id)) ipcRenderer.send("browser:forward", id);
    },
    reload: (id) => {
      if (isSessionId(id)) ipcRenderer.send("browser:reload", id);
    },
    setVisible: (id, visible) => {
      if (isSessionId(id)) {
        ipcRenderer.send("browser:set-visible", { id, visible: Boolean(visible) });
      }
    },
    destroy: (id) => {
      if (isSessionId(id)) ipcRenderer.send("browser:destroy", id);
    },
    onState: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("browser:state", listener);
      return () => ipcRenderer.removeListener("browser:state", listener);
    },
  },
  files: {
    home: () => ipcRenderer.invoke("files:home"),
    listDirectory: (directory) => {
      if (directory !== undefined && !isSafeText(directory)) {
        throw new Error("Invalid directory");
      }
      return ipcRenderer.invoke("files:list-directory", directory);
    },
  },
  profile: {
    load: () => ipcRenderer.invoke("profile:load"),
    save: (entries) =>
      ipcRenderer.invoke("profile:save", sanitizeProfileEntries(entries)),
    info: () => ipcRenderer.invoke("profile:info"),
  },
  updates: {
    getStatus: () => ipcRenderer.invoke("updates:get-status"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.send("updates:install"),
    openReleases: () => ipcRenderer.send("updates:open-releases"),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("updates:status", listener);
      return () => ipcRenderer.removeListener("updates:status", listener);
    },
  },
});
