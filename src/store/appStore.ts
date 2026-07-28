import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppSettings,
  CommandGroup,
  FontId,
  NewTabOptions,
  QuickCommand,
  ShortcutAction,
  SplitDirection,
  SplitNode,
  TabKind,
  TerminalTab,
  ThemeId,
  Workspace,
} from "../types";

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const shortcutLabels: Record<ShortcutAction, string> = {
  newTab: "New tab",
  closeTab: "Close tab",
  newWorkspace: "New workspace",
  nextWorkspace: "Next workspace",
  previousWorkspace: "Previous workspace",
  splitHorizontal: "Split left / right",
  splitVertical: "Split top / bottom",
  closePane: "Close pane",
  toggleSidebar: "Toggle sidebar",
  openSettings: "Open settings",
  searchTerminal: "Search terminal",
  copyTerminal: "Copy terminal selection",
  pasteTerminal: "Paste into terminal",
  sendInterrupt: "Send interrupt",
  clearInput: "Clear current input",
  clearTerminal: "Clear terminal",
  showCompletions: "Show file completions",
};

export const defaultSettings: AppSettings = {
  general: {
    restoreSession: true,
    confirmBeforeClose: false,
    compactInterface: false,
  },
  appearance: {
    theme: "neon-violet",
    font: "cascadia",
    fontSize: 14,
    lineHeight: 1.25,
    opacity: 1,
    uiFontSize: 11,
  },
  terminal: {
    shell: "",
    scrollback: 100_000,
    cursorStyle: "block",
    cursorBlink: true,
    copyOnSelect: false,
    screenScrollMode: false,
    fileCompletion: true,
    searchHighlightAll: true,
    searchHighlightColor: "#f6c85f",
  },
  shortcuts: {
    newTab: "Primary+Shift+T",
    closeTab: "Primary+W",
    newWorkspace: "Primary+Shift+N",
    nextWorkspace: "Primary+Alt+ArrowRight",
    previousWorkspace: "Primary+Alt+ArrowLeft",
    splitHorizontal: "Primary+Alt+H",
    splitVertical: "Primary+Alt+V",
    closePane: "Primary+Shift+W",
    toggleSidebar: "Primary+B",
    openSettings: "Primary+,",
    searchTerminal: "Primary+F",
    copyTerminal: "Primary+C",
    pasteTerminal: "Primary+V",
    sendInterrupt: "Primary+Alt+C",
    clearInput: "Primary+K",
    clearTerminal: "Primary+L",
    showCompletions: "Primary+Space",
  },
};

const defaultCommands: CommandGroup[] = [
  {
    id: "group-development",
    name: "Development",
    expanded: true,
    commands: [
      {
        id: "command-git-status",
        name: "Git status",
        command: "git status",
        fastExecution: true,
      },
      {
        id: "command-files",
        name: "List files",
        command: "ls -la",
        fastExecution: true,
      },
      {
        id: "command-ports",
        name: "Listening ports",
        command: "ss -lntup",
        fastExecution: true,
      },
    ],
  },
  {
    id: "group-system",
    name: "System",
    expanded: true,
    commands: [
      {
        id: "command-processes",
        name: "Top processes",
        command: "ps aux --sort=-%mem | head -20",
        fastExecution: true,
      },
      {
        id: "command-disk",
        name: "Disk usage",
        command: "df -h",
        fastExecution: true,
      },
      {
        id: "command-colors",
        name: "ANSI color test",
        command:
          "printf '\\033[31merror\\033[0m  \\033[33mwarning\\033[0m  \\033[32msuccess\\033[0m  \\033[36minfo\\033[0m\\n'",
        fastExecution: true,
      },
    ],
  },
];

function createPane(): SplitNode & { type: "pane" } {
  return {
    type: "pane",
    id: createId("pane"),
    sessionId: createId("session"),
  };
}

const defaultTabNames: Record<TabKind, string> = {
  terminal: "Shell",
  browser: "Browser",
  files: "Files",
  note: "Note",
};

function createTab(options: NewTabOptions = {}): TerminalTab {
  const kind = options.kind ?? "terminal";
  const pane = createPane();
  return {
    id: createId("tab"),
    name: options.name ?? defaultTabNames[kind],
    kind,
    root: pane,
    activePaneId: pane.id,
    browserUrl:
      kind === "browser"
        ? options.browserUrl ?? "https://duckduckgo.com/"
        : undefined,
    filePath: kind === "files" ? options.filePath ?? "~" : undefined,
    noteContent: kind === "note" ? options.noteContent ?? "" : undefined,
  };
}

function createWorkspace(name = "Main"): Workspace {
  const tab = createTab({ kind: "terminal" });
  return {
    id: createId("workspace"),
    name,
    tabs: [tab],
    activeTabId: tab.id,
  };
}

const initialWorkspace = createWorkspace();

export function collectSessionIds(node: SplitNode): string[] {
  if (node.type === "pane") return [node.sessionId];
  return [
    ...collectSessionIds(node.first),
    ...collectSessionIds(node.second),
  ];
}

export function splitNode(
  node: SplitNode,
  paneId: string,
  direction: SplitDirection,
  nextPane: SplitNode & { type: "pane" },
): SplitNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return {
      type: "split",
      id: createId("split"),
      direction,
      ratio: 0.5,
      first: node,
      second: nextPane,
    };
  }
  return {
    ...node,
    first: splitNode(node.first, paneId, direction, nextPane),
    second: splitNode(node.second, paneId, direction, nextPane),
  };
}

export function removePane(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === "pane") return node.id === paneId ? null : node;
  const first = removePane(node.first, paneId);
  const second = removePane(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function firstPane(node: SplitNode): SplitNode & { type: "pane" } {
  return node.type === "pane" ? node : firstPane(node.first);
}

function updateNodeRatio(
  node: SplitNode,
  splitId: string,
  ratio: number,
): SplitNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) {
    return { ...node, ratio: Math.min(0.85, Math.max(0.15, ratio)) };
  }
  return {
    ...node,
    first: updateNodeRatio(node.first, splitId, ratio),
    second: updateNodeRatio(node.second, splitId, ratio),
  };
}

interface AppStore {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  commandGroups: CommandGroup[];
  settings: AppSettings;
  sidebarVisible: boolean;
  setActiveWorkspace: (workspaceId: string) => void;
  addWorkspace: () => { workspaceId: string; paneId: string };
  renameWorkspace: (workspaceId: string, name: string) => void;
  closeWorkspace: (workspaceId: string) => void;
  setActiveTab: (workspaceId: string, tabId: string) => void;
  addTab: (
    workspaceId: string,
    options?: NewTabOptions,
  ) => { tabId: string; paneId: string };
  updateTab: (
    workspaceId: string,
    tabId: string,
    value: Partial<Omit<TerminalTab, "id" | "root" | "activePaneId">>,
  ) => void;
  renameTab: (workspaceId: string, tabId: string, name: string) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  setActivePane: (workspaceId: string, tabId: string, paneId: string) => void;
  splitPane: (
    workspaceId: string,
    tabId: string,
    paneId: string,
    direction: SplitDirection,
  ) => string;
  closePane: (workspaceId: string, tabId: string, paneId: string) => void;
  setSplitRatio: (
    workspaceId: string,
    tabId: string,
    splitId: string,
    ratio: number,
  ) => void;
  setSidebarVisible: (value: boolean) => void;
  updateGeneral: (value: Partial<AppSettings["general"]>) => void;
  updateAppearance: (value: Partial<AppSettings["appearance"]>) => void;
  updateTerminal: (value: Partial<AppSettings["terminal"]>) => void;
  setShortcut: (action: ShortcutAction, value: string) => void;
  resetShortcuts: () => void;
  toggleCommandGroup: (groupId: string) => void;
  addCommandGroup: (name: string) => void;
  renameCommandGroup: (groupId: string, name: string) => void;
  removeCommandGroup: (groupId: string) => void;
  addCommand: (groupId: string, command: Omit<QuickCommand, "id">) => void;
  updateCommand: (
    groupId: string,
    commandId: string,
    command: Omit<QuickCommand, "id">,
  ) => void;
  removeCommand: (groupId: string, commandId: string) => void;
  setTheme: (theme: ThemeId) => void;
  setFont: (font: FontId) => void;
}

type PersistedAppState = Pick<
  AppStore,
  | "workspaces"
  | "activeWorkspaceId"
  | "commandGroups"
  | "settings"
  | "sidebarVisible"
>;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      workspaces: [initialWorkspace],
      activeWorkspaceId: initialWorkspace.id,
      commandGroups: defaultCommands,
      settings: defaultSettings,
      sidebarVisible: false,

      setActiveWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId }),

      addWorkspace: () => {
        const workspace = createWorkspace(
          `Workspace ${get().workspaces.length + 1}`,
        );
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
          activeWorkspaceId: workspace.id,
        }));
        return {
          workspaceId: workspace.id,
          paneId: firstPane(workspace.tabs[0].root).id,
        };
      },

      renameWorkspace: (workspaceId, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? { ...workspace, name: name.trim() || workspace.name }
              : workspace,
          ),
        })),

      closeWorkspace: (workspaceId) =>
        set((state) => {
          if (state.workspaces.length === 1) return state;
          const index = state.workspaces.findIndex(
            (workspace) => workspace.id === workspaceId,
          );
          const workspaces = state.workspaces.filter(
            (workspace) => workspace.id !== workspaceId,
          );
          const next = workspaces[Math.min(Math.max(index, 0), workspaces.length - 1)];
          return {
            workspaces,
            activeWorkspaceId:
              state.activeWorkspaceId === workspaceId
                ? next.id
                : state.activeWorkspaceId,
          };
        }),

      setActiveTab: (workspaceId, activeTabId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? { ...workspace, activeTabId }
              : workspace,
          ),
        })),

      addTab: (workspaceId, options = {}) => {
        const workspace = get().workspaces.find(
          (item) => item.id === workspaceId,
        );
        const kind = options.kind ?? "terminal";
        const kindCount =
          workspace?.tabs.filter((tab) => tab.kind === kind).length ?? 0;
        const tab = createTab({
          ...options,
          name:
            options.name ??
            (kind === "terminal" && kindCount > 0
              ? `Terminal ${kindCount + 1}`
              : defaultTabNames[kind]),
        });
        set((state) => ({
          workspaces: state.workspaces.map((item) =>
            item.id === workspaceId
              ? {
                  ...item,
                  tabs: [...item.tabs, tab],
                  activeTabId: tab.id,
                }
              : item,
          ),
        }));
        return { tabId: tab.id, paneId: firstPane(tab.root).id };
      },

      updateTab: (workspaceId, tabId, value) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  tabs: workspace.tabs.map((tab) =>
                    tab.id === tabId ? { ...tab, ...value } : tab,
                  ),
                }
              : workspace,
          ),
        })),

      renameTab: (workspaceId, tabId, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  tabs: workspace.tabs.map((tab) =>
                    tab.id === tabId
                      ? { ...tab, name: name.trim() || tab.name }
                      : tab,
                  ),
                }
              : workspace,
          ),
        })),

      closeTab: (workspaceId, tabId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) => {
            if (workspace.id !== workspaceId) return workspace;
            const index = workspace.tabs.findIndex((tab) => tab.id === tabId);
            let tabs = workspace.tabs.filter((tab) => tab.id !== tabId);
            if (tabs.length === 0) {
              tabs = [createTab({ kind: "terminal" })];
            }
            const activeTab = tabs[Math.min(Math.max(index, 0), tabs.length - 1)];
            return {
              ...workspace,
              tabs,
              activeTabId:
                workspace.activeTabId === tabId
                  ? activeTab.id
                  : workspace.activeTabId,
            };
          }),
        })),

      setActivePane: (workspaceId, tabId, activePaneId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  tabs: workspace.tabs.map((tab) =>
                    tab.id === tabId ? { ...tab, activePaneId } : tab,
                  ),
                }
              : workspace,
          ),
        })),

      splitPane: (workspaceId, tabId, paneId, direction) => {
        const pane = createPane();
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  tabs: workspace.tabs.map((tab) =>
                    tab.id === tabId
                      ? {
                          ...tab,
                          root: splitNode(tab.root, paneId, direction, pane),
                          activePaneId: pane.id,
                        }
                      : tab,
                  ),
                }
              : workspace,
          ),
        }));
        return pane.id;
      },

      closePane: (workspaceId, tabId, paneId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) => {
            if (workspace.id !== workspaceId) return workspace;
            return {
              ...workspace,
              tabs: workspace.tabs.map((tab) => {
                if (tab.id !== tabId) return tab;
                const root = removePane(tab.root, paneId);
                if (!root) return tab;
                return {
                  ...tab,
                  root,
                  activePaneId: firstPane(root).id,
                };
              }),
            };
          }),
        })),

      setSplitRatio: (workspaceId, tabId, splitId, ratio) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  tabs: workspace.tabs.map((tab) =>
                    tab.id === tabId
                      ? {
                          ...tab,
                          root: updateNodeRatio(tab.root, splitId, ratio),
                        }
                      : tab,
                  ),
                }
              : workspace,
          ),
        })),

      setSidebarVisible: (sidebarVisible) => set({ sidebarVisible }),

      updateGeneral: (value) =>
        set((state) => ({
          settings: {
            ...state.settings,
            general: { ...state.settings.general, ...value },
          },
        })),

      updateAppearance: (value) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: { ...state.settings.appearance, ...value },
          },
        })),

      updateTerminal: (value) =>
        set((state) => ({
          settings: {
            ...state.settings,
            terminal: { ...state.settings.terminal, ...value },
          },
        })),

      setShortcut: (action, value) =>
        set((state) => ({
          settings: {
            ...state.settings,
            shortcuts: { ...state.settings.shortcuts, [action]: value },
          },
        })),

      resetShortcuts: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            shortcuts: defaultSettings.shortcuts,
          },
        })),

      toggleCommandGroup: (groupId) =>
        set((state) => ({
          commandGroups: state.commandGroups.map((group) =>
            group.id === groupId
              ? { ...group, expanded: !group.expanded }
              : group,
          ),
        })),

      addCommandGroup: (name) =>
        set((state) => ({
          commandGroups: [
            ...state.commandGroups,
            {
              id: createId("group"),
              name: name.trim(),
              expanded: true,
              commands: [],
            },
          ],
        })),

      renameCommandGroup: (groupId, name) =>
        set((state) => ({
          commandGroups: state.commandGroups.map((group) =>
            group.id === groupId
              ? { ...group, name: name.trim() || group.name }
              : group,
          ),
        })),

      removeCommandGroup: (groupId) =>
        set((state) => ({
          commandGroups: state.commandGroups.filter(
            (group) => group.id !== groupId,
          ),
        })),

      addCommand: (groupId, command) =>
        set((state) => ({
          commandGroups: state.commandGroups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  commands: [
                    ...group.commands,
                    { ...command, id: createId("command") },
                  ],
                }
              : group,
          ),
        })),

      updateCommand: (groupId, commandId, command) =>
        set((state) => ({
          commandGroups: state.commandGroups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  commands: group.commands.map((item) =>
                    item.id === commandId ? { ...item, ...command } : item,
                  ),
                }
              : group,
          ),
        })),

      removeCommand: (groupId, commandId) =>
        set((state) => ({
          commandGroups: state.commandGroups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  commands: group.commands.filter(
                    (command) => command.id !== commandId,
                  ),
                }
              : group,
          ),
        })),

      setTheme: (theme: ThemeId) =>
        get().updateAppearance({ theme }),

      setFont: (font: FontId) =>
        get().updateAppearance({ font }),
    }),
    {
      name: "fz-terminal-state",
      version: 5,
      migrate: (persistedState, version) => {
        const saved = persistedState as PersistedAppState;
        const migrated =
          version >= 3
            ? saved
            : {
                ...saved,
                settings: {
                  ...saved.settings,
                  appearance: {
                    ...saved.settings.appearance,
                    theme: "neon-violet" as ThemeId,
                  },
                },
              };
        const withSidebar = version < 4
          ? { ...migrated, sidebarVisible: false }
          : migrated;
        return version < 5
          ? {
              ...withSidebar,
              settings: {
                ...withSidebar.settings,
                terminal: {
                  ...withSidebar.settings.terminal,
                  scrollback: Math.max(
                    100_000,
                    withSidebar.settings.terminal.scrollback,
                  ),
                },
              },
            }
          : withSidebar;
      },
      partialize: (state) => ({
        workspaces: state.settings.general.restoreSession
          ? state.workspaces
          : [createWorkspace()],
        activeWorkspaceId: state.activeWorkspaceId,
        commandGroups: state.commandGroups,
        settings: state.settings,
        sidebarVisible: state.sidebarVisible,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppStore>;
        const settings = saved.settings
          ? {
              ...current.settings,
              ...saved.settings,
              general: {
                ...current.settings.general,
                ...saved.settings.general,
              },
              appearance: {
                ...current.settings.appearance,
                ...saved.settings.appearance,
              },
              terminal: {
                ...current.settings.terminal,
                ...saved.settings.terminal,
              },
              shortcuts: {
                ...current.settings.shortcuts,
                ...saved.settings.shortcuts,
              },
            }
          : current.settings;
        const commandGroups = (
          saved.commandGroups ?? current.commandGroups
        ).map((group) => ({
          ...group,
          commands: group.commands.map((command) => ({
            ...command,
            fastExecution: command.fastExecution ?? true,
          })),
        }));
        const workspaces = (
          saved.workspaces ?? current.workspaces
        ).map((workspace) => ({
          ...workspace,
          tabs: workspace.tabs.map((tab) => ({
            ...tab,
            kind: tab.kind ?? "terminal",
          })),
        }));
        return {
          ...current,
          ...saved,
          settings,
          commandGroups,
          workspaces,
        };
      },
    },
  ),
);
