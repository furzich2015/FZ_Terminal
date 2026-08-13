import type { ITheme } from "@xterm/xterm";

export type SplitDirection = "horizontal" | "vertical";
export type TabKind = "terminal" | "browser" | "files" | "note";

export interface BrowserPageTab {
  id: string;
  url: string;
  title?: string;
}

export type SplitNode =
  | {
      type: "pane";
      id: string;
      sessionId: string;
      kind?: TabKind;
      browserUrl?: string;
      browserTabs?: BrowserPageTab[];
      activeBrowserTabId?: string;
      filePath?: string;
      remoteFilePath?: string;
      remoteConnectionId?: string;
      noteContent?: string;
      noteScrollTop?: number;
    }
  | {
      type: "split";
      id: string;
      direction: SplitDirection;
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export interface TerminalTab {
  id: string;
  name: string;
  kind: TabKind;
  root: SplitNode;
  activePaneId: string;
  browserUrl?: string;
  filePath?: string;
  noteContent?: string;
}

export interface NewTabOptions {
  kind?: TabKind;
  name?: string;
  browserUrl?: string;
  filePath?: string;
  noteContent?: string;
}

export interface Workspace {
  id: string;
  name: string;
  tabs: TerminalTab[];
  activeTabId: string;
}

export interface RemoteConnection {
  id: string;
  name: string;
  host: string;
  user?: string;
  port: number;
  rootPath: string;
  identityFile?: string;
  workspaceIds: string[];
  source: "manual" | "detected";
}

export interface DetectedRemoteConnection {
  host: string;
  user?: string;
  port: number;
  identityFile?: string;
}

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
  fastExecution: boolean;
}

export interface CommandGroup {
  id: string;
  name: string;
  expanded: boolean;
  commands: QuickCommand[];
}

export type ThemeId =
  | "neon-violet"
  | "neon-cyan"
  | "neon-ember"
  | "midnight"
  | "graphite"
  | "daylight"
  | "ocean"
  | "matrix"
  | "tokyo-night"
  | "gruvbox"
  | "rose-pine";
export type FontId = "cascadia" | "ibm-plex" | "dm-mono";
export type CursorStyle = "block" | "underline" | "bar";

export interface CustomPalette {
  app: string;
  titlebar: string;
  sidebar: string;
  surface: string;
  elevated: string;
  hover: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentHover: string;
  danger: string;
  warning: string;
  success: string;
  terminalBackground: string;
  terminalForeground: string;
  terminalCursor: string;
  terminalSelection: string;
  ansiBlack: string;
  ansiRed: string;
  ansiGreen: string;
  ansiYellow: string;
  ansiBlue: string;
  ansiMagenta: string;
  ansiCyan: string;
  ansiWhite: string;
}

export type ShortcutAction =
  | "newWindow"
  | "newTab"
  | "closeTab"
  | "nextTab"
  | "previousTab"
  | "activateTab1"
  | "activateTab2"
  | "activateTab3"
  | "activateTab4"
  | "activateTab5"
  | "activateTab6"
  | "activateTab7"
  | "activateTab8"
  | "activateLastTab"
  | "newWorkspace"
  | "nextWorkspace"
  | "previousWorkspace"
  | "splitHorizontal"
  | "splitVertical"
  | "closePane"
  | "focusPaneLeft"
  | "focusPaneRight"
  | "focusPaneUp"
  | "focusPaneDown"
  | "toggleMaximizePane"
  | "toggleSidebar"
  | "commandPalette"
  | "openSettings"
  | "searchTerminal"
  | "copyTerminal"
  | "pasteTerminal"
  | "sendInterrupt"
  | "clearInput"
  | "clearTerminal"
  | "showCompletions"
  | "zoomIn"
  | "zoomOut"
  | "resetFontSize";

export interface AppSettings {
  general: {
    restoreSession: boolean;
    confirmBeforeClose: boolean;
    compactInterface: boolean;
  };
  appearance: {
    theme: ThemeId;
    font: FontId;
    uiFontFamily: string;
    terminalFontFamily: string;
    fontSize: number;
    lineHeight: number;
    opacity: number;
    interfaceOpacity: number;
    uiFontSize: number;
    cornerRadius: number;
    panelGap: number;
    interfaceBlur: number;
    showBackgroundGrid: boolean;
    highContrastText: boolean;
    advancedColors: boolean;
    customPalette: CustomPalette;
  };
  terminal: {
    shell: string;
    scrollback: number;
    cursorStyle: CursorStyle;
    cursorBlink: boolean;
    copyOnSelect: boolean;
    screenScrollMode: boolean;
    fileCompletion: boolean;
    commandSuggestions: boolean;
    searchHighlightAll: boolean;
    searchHighlightColor: string;
  };
  shortcuts: Record<ShortcutAction, string>;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  swatches: string[];
  xterm: ITheme;
  ui: {
    app: string;
    titlebar: string;
    sidebar: string;
    surface: string;
    elevated: string;
    hover: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentHover: string;
    accentSoft: string;
    shadow: string;
    danger: string;
    warning: string;
    success: string;
  };
}

export interface MenuPosition {
  x: number;
  y: number;
}

export interface PtyCreateOptions {
  id: string;
  cols: number;
  rows: number;
  cwd?: string;
  shell?: string;
}

export interface PtyCreateResult {
  id: string;
  backlog: string;
  pid: number;
}

export interface PtyDataEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

export interface DirectoryEntry {
  name: string;
  directory: boolean;
  path?: string;
  size?: number;
  modified?: number;
}

export interface DirectoryListing {
  cwd: string;
  entries: DirectoryEntry[];
  remote?: boolean;
}

export interface RemoteFileTransferRequest {
  direction: "upload" | "download";
  sourcePath: string;
  targetDirectory: string;
  directory: boolean;
  sudoPassword?: string;
}

export interface RemoteFileTransferResult {
  direction: "upload" | "download";
  sourcePath: string;
  targetDirectory: string;
}

export interface FileOperationRequest {
  path: string;
  connection?: RemoteConnection;
  sudoPassword?: string;
}

export interface FileDeleteRequest extends FileOperationRequest {
  directory: boolean;
}

export interface FileMoveRequest {
  sourcePath: string;
  targetDirectory: string;
  connection?: RemoteConnection;
  sudoPassword?: string;
}

export interface FileReadResult {
  path: string;
  content: string;
  size: number;
}

export interface PtyContext {
  exists?: boolean;
  remote: boolean;
  verified?: boolean;
  busy?: boolean;
  multiplexer: "screen" | "tmux" | null;
  connection?: DetectedRemoteConnection;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

export interface ProfileBackup {
  version: 1;
  savedAt?: string;
  entries: Record<string, string>;
}

export interface ProfileInfo {
  userDataPath: string;
  backupPath: string;
  savedAt?: string;
  importedFrom?: string | null;
}

export type UpdateState =
  | "development"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  availableVersion?: string;
  message: string;
  progress?: number;
}

export interface FzTerminalBridge {
  window: {
    id: string;
    newWindow: () => void;
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    setOpacity: (value: number) => void;
    isMaximized: () => Promise<boolean>;
    onMaximized: (callback: (value: boolean) => void) => () => void;
  };
  fonts: {
    list: () => Promise<string[]>;
  };
  pty: {
    create: (options: PtyCreateOptions) => Promise<PtyCreateResult>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    listDirectory: (
      id: string,
      directory?: string,
      currentDirectory?: string,
    ) => Promise<DirectoryListing>;
    getContext: (id: string) => Promise<PtyContext>;
    onData: (callback: (event: PtyDataEvent) => void) => () => void;
    onExit: (callback: (event: PtyExitEvent) => void) => () => void;
  };
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
  browser: {
    create: (id: string, url: string, bounds: BrowserBounds) => Promise<void>;
    setBounds: (id: string, bounds: BrowserBounds) => void;
    navigate: (id: string, url: string) => void;
    back: (id: string) => void;
    forward: (id: string) => void;
    reload: (id: string) => void;
    setVisible: (id: string, visible: boolean) => void;
    destroy: (id: string) => void;
    onState: (callback: (state: BrowserState) => void) => () => void;
    onContextMenu: (
      callback: (value: { id: string; x: number; y: number }) => void,
    ) => () => void;
  };
  files: {
    home: () => Promise<string>;
    listDirectory: (
      directory?: string,
      sudoPassword?: string,
    ) => Promise<DirectoryListing>;
    listRemoteDirectory: (
      connection: RemoteConnection,
      directory?: string,
      force?: boolean,
      sudoPassword?: string,
    ) => Promise<DirectoryListing>;
    transfer: (
      connection: RemoteConnection,
      request: RemoteFileTransferRequest,
    ) => Promise<RemoteFileTransferResult>;
    remoteTerminalArgs: (
      connection: RemoteConnection,
      command: string,
    ) => Promise<string[]>;
    createDirectory: (request: FileOperationRequest) => Promise<{ path: string }>;
    deleteEntry: (request: FileDeleteRequest) => Promise<{ path: string }>;
    moveEntry: (request: FileMoveRequest) => Promise<{ path: string }>;
    readFile: (request: FileOperationRequest) => Promise<FileReadResult>;
    writeFile: (
      request: FileOperationRequest & { content: string },
    ) => Promise<{ path: string; size: number }>;
    openExternal: (path: string) => Promise<void>;
  };
  profile: {
    load: () => Promise<ProfileBackup>;
    save: (
      entries: Record<string, string>,
    ) => Promise<{ savedAt: string }>;
    info: () => Promise<ProfileInfo>;
  };
  updates: {
    getStatus: () => Promise<UpdateStatus>;
    check: () => Promise<UpdateStatus>;
    download: () => Promise<UpdateStatus>;
    install: () => void;
    openReleases: () => void;
    onStatus: (
      callback: (status: UpdateStatus) => void,
    ) => () => void;
  };
}

declare global {
  interface Window {
    fzTerminal: FzTerminalBridge;
  }
}
