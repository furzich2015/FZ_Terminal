import type { ITheme } from "@xterm/xterm";

export type SplitDirection = "horizontal" | "vertical";
export type TabKind = "terminal" | "browser" | "files" | "note";

export type SplitNode =
  | {
      type: "pane";
      id: string;
      sessionId: string;
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
  | "ocean";
export type FontId = "cascadia" | "ibm-plex" | "dm-mono";
export type CursorStyle = "block" | "underline" | "bar";

export type ShortcutAction =
  | "newTab"
  | "closeTab"
  | "newWorkspace"
  | "nextWorkspace"
  | "previousWorkspace"
  | "splitHorizontal"
  | "splitVertical"
  | "closePane"
  | "toggleSidebar"
  | "openSettings"
  | "searchTerminal"
  | "copyTerminal"
  | "pasteTerminal"
  | "sendInterrupt"
  | "clearInput"
  | "clearTerminal"
  | "showCompletions";

export interface AppSettings {
  general: {
    restoreSession: boolean;
    confirmBeforeClose: boolean;
    compactInterface: boolean;
  };
  appearance: {
    theme: ThemeId;
    font: FontId;
    fontSize: number;
    lineHeight: number;
    opacity: number;
    uiFontSize: number;
  };
  terminal: {
    shell: string;
    scrollback: number;
    cursorStyle: CursorStyle;
    cursorBlink: boolean;
    copyOnSelect: boolean;
    screenScrollMode: boolean;
    fileCompletion: boolean;
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

export interface PtyContext {
  remote: boolean;
  multiplexer: "screen" | "tmux" | null;
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
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximized: (callback: (value: boolean) => void) => () => void;
  };
  pty: {
    create: (options: PtyCreateOptions) => Promise<PtyCreateResult>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    listDirectory: (
      id: string,
      directory?: string,
    ) => Promise<DirectoryListing>;
    getContext: (id: string) => Promise<PtyContext>;
    onData: (callback: (event: PtyDataEvent) => void) => () => void;
    onExit: (callback: (event: PtyExitEvent) => void) => () => void;
  };
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => void;
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
  };
  files: {
    home: () => Promise<string>;
    listDirectory: (directory?: string) => Promise<DirectoryListing>;
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
