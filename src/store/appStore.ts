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
import { fonts, paletteFromTheme, themes } from "../lib/themes";

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const shortcutLabels: Record<ShortcutAction, string> = {
  newTab: "New tab",
  closeTab: "Close tab",
  nextTab: "Next tab",
  previousTab: "Previous tab",
  activateTab1: "Switch to tab 1",
  activateTab2: "Switch to tab 2",
  activateTab3: "Switch to tab 3",
  activateTab4: "Switch to tab 4",
  activateTab5: "Switch to tab 5",
  activateTab6: "Switch to tab 6",
  activateTab7: "Switch to tab 7",
  activateTab8: "Switch to tab 8",
  activateLastTab: "Switch to last tab",
  newWorkspace: "New workspace",
  nextWorkspace: "Next workspace",
  previousWorkspace: "Previous workspace",
  splitHorizontal: "Split left / right",
  splitVertical: "Split top / bottom",
  closePane: "Close pane",
  focusPaneLeft: "Focus pane left",
  focusPaneRight: "Focus pane right",
  focusPaneUp: "Focus pane above",
  focusPaneDown: "Focus pane below",
  toggleMaximizePane: "Maximize active pane",
  toggleSidebar: "Toggle sidebar",
  commandPalette: "Quick command palette",
  openSettings: "Open settings",
  searchTerminal: "Search terminal",
  copyTerminal: "Copy terminal selection",
  pasteTerminal: "Paste into terminal",
  sendInterrupt: "Send interrupt",
  clearInput: "Clear current input",
  clearTerminal: "Clear terminal",
  showCompletions: "Show file completions",
  zoomIn: "Increase terminal font",
  zoomOut: "Decrease terminal font",
  resetFontSize: "Reset terminal font",
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
    uiFontFamily: "system-ui",
    terminalFontFamily: "Cascadia Code",
    fontSize: 14,
    lineHeight: 1.25,
    opacity: 1,
    interfaceOpacity: 1,
    uiFontSize: 14,
    cornerRadius: 5,
    panelGap: 0,
    interfaceBlur: 18,
    showBackgroundGrid: false,
    highContrastText: false,
    advancedColors: false,
    customPalette: paletteFromTheme(themes["neon-violet"]),
  },
  terminal: {
    shell: "",
    scrollback: 100_000,
    cursorStyle: "block",
    cursorBlink: true,
    copyOnSelect: true,
    screenScrollMode: false,
    fileCompletion: true,
    searchHighlightAll: true,
    searchHighlightColor: "#f6c85f",
  },
  shortcuts: {
    newTab: "Primary+Shift+T",
    closeTab: "Primary+Shift+W",
    nextTab: "Primary+PageDown",
    previousTab: "Primary+PageUp",
    activateTab1: "Primary+Digit1",
    activateTab2: "Primary+Digit2",
    activateTab3: "Primary+Digit3",
    activateTab4: "Primary+Digit4",
    activateTab5: "Primary+Digit5",
    activateTab6: "Primary+Digit6",
    activateTab7: "Primary+Digit7",
    activateTab8: "Primary+Digit8",
    activateLastTab: "Primary+Digit9",
    newWorkspace: "Primary+Shift+N",
    nextWorkspace: "Primary+Alt+Shift+ArrowRight",
    previousWorkspace: "Primary+Alt+Shift+ArrowLeft",
    splitHorizontal: "Primary+Shift+D",
    splitVertical: "Primary+Shift+E",
    closePane: "Primary+Shift+W",
    focusPaneLeft: "Primary+Alt+ArrowLeft",
    focusPaneRight: "Primary+Alt+ArrowRight",
    focusPaneUp: "Primary+Alt+ArrowUp",
    focusPaneDown: "Primary+Alt+ArrowDown",
    toggleMaximizePane: "Primary+Shift+Enter",
    toggleSidebar: "Primary+Shift+B",
    commandPalette: "Primary+Shift+P",
    openSettings: "Primary+,",
    searchTerminal: "Primary+Shift+F",
    copyTerminal: "Primary+Shift+C",
    pasteTerminal: "Primary+Shift+V",
    sendInterrupt: "Ctrl+C",
    clearInput: "Ctrl+U",
    clearTerminal: "Ctrl+L",
    showCompletions: "Primary+Space",
    zoomIn: "Primary+Equal",
    zoomOut: "Primary+Minus",
    resetFontSize: "Primary+Digit0",
  },
};

const versionSevenShortcutDefaults: Partial<
  Record<ShortcutAction, string>
> = {
  newTab: "Primary+Shift+T",
  closeTab: "Primary+Shift+W",
  nextTab: "Primary+Tab",
  previousTab: "Primary+Shift+Tab",
  newWorkspace: "Primary+Shift+N",
  nextWorkspace: "Primary+Alt+ArrowRight",
  previousWorkspace: "Primary+Alt+ArrowLeft",
  splitHorizontal: "Primary+Alt+H",
  splitVertical: "Primary+Alt+V",
  closePane: "Primary+Alt+W",
  toggleSidebar: "Primary+B",
  openSettings: "Primary+,",
  searchTerminal: "Primary+Shift+F",
  copyTerminal: "Primary+Shift+C",
  pasteTerminal: "Primary+Shift+V",
  sendInterrupt: "Ctrl+C",
  clearInput: "Ctrl+U",
  clearTerminal: "Ctrl+L",
  showCompletions: "Primary+Space",
  zoomIn: "Primary+Equal",
  zoomOut: "Primary+Minus",
  resetFontSize: "Primary+Digit0",
};

const previousShortcutDefaults: Partial<
  Record<ShortcutAction, string>
> = {
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
        ? options.browserUrl ?? "https://www.google.com/"
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

function moveBefore<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) return items;
  const source = items.find((item) => item.id === sourceId);
  if (!source) return items;
  const withoutSource = items.filter((item) => item.id !== sourceId);
  const targetIndex = withoutSource.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return [...withoutSource, source];
  return [
    ...withoutSource.slice(0, targetIndex),
    source,
    ...withoutSource.slice(targetIndex),
  ];
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
  moveWorkspace: (sourceId: string, targetId: string) => void;
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
  moveTab: (workspaceId: string, sourceId: string, targetId: string) => void;
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
  moveCommandGroup: (sourceId: string, targetId: string) => void;
  addCommand: (groupId: string, command: Omit<QuickCommand, "id">) => void;
  updateCommand: (
    groupId: string,
    commandId: string,
    command: Omit<QuickCommand, "id">,
  ) => void;
  removeCommand: (groupId: string, commandId: string) => void;
  moveCommand: (
    sourceGroupId: string,
    commandId: string,
    targetGroupId: string,
    targetCommandId?: string,
  ) => void;
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
      sidebarVisible: true,

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

      moveWorkspace: (sourceId, targetId) =>
        set((state) => ({
          workspaces: moveBefore(state.workspaces, sourceId, targetId),
        })),

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

      moveTab: (workspaceId, sourceId, targetId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  tabs: moveBefore(workspace.tabs, sourceId, targetId),
                }
              : workspace,
          ),
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

      moveCommandGroup: (sourceId, targetId) =>
        set((state) => ({
          commandGroups: moveBefore(
            state.commandGroups,
            sourceId,
            targetId,
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

      moveCommand: (
        sourceGroupId,
        commandId,
        targetGroupId,
        targetCommandId,
      ) =>
        set((state) => {
          const command = state.commandGroups
            .find((group) => group.id === sourceGroupId)
            ?.commands.find((item) => item.id === commandId);
          if (!command) return state;
          const withoutCommand = state.commandGroups.map((group) => ({
            ...group,
            commands: group.commands.filter((item) => item.id !== commandId),
          }));
          return {
            commandGroups: withoutCommand.map((group) => {
              if (group.id !== targetGroupId) return group;
              const targetIndex = targetCommandId
                ? group.commands.findIndex(
                    (item) => item.id === targetCommandId,
                  )
                : -1;
              const index =
                targetIndex < 0 ? group.commands.length : targetIndex;
              return {
                ...group,
                expanded: true,
                commands: [
                  ...group.commands.slice(0, index),
                  command,
                  ...group.commands.slice(index),
                ],
              };
            }),
          };
        }),

      setTheme: (theme: ThemeId) =>
        get().updateAppearance({ theme }),

      setFont: (font: FontId) =>
        get().updateAppearance({
          font,
          terminalFontFamily: fonts[font].label,
        }),
    }),
    {
      name: "fz-terminal-state",
      version: 9,
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
        const withScrollback = version < 5
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
        const withShortcuts =
          version >= 6
            ? withScrollback
            : {
                ...withScrollback,
                settings: {
                  ...withScrollback.settings,
                  shortcuts: Object.fromEntries(
                    (
                      Object.keys(
                        defaultSettings.shortcuts,
                      ) as ShortcutAction[]
                    ).map((action) => {
                      const savedValue =
                        withScrollback.settings.shortcuts?.[action];
                      const legacyDefault =
                        previousShortcutDefaults[action];
                      return [
                        action,
                        savedValue === undefined ||
                        savedValue === legacyDefault
                          ? defaultSettings.shortcuts[action]
                          : savedValue,
                      ];
                    }),
                  ) as Record<ShortcutAction, string>,
                },
              };
        const withAppearance =
          version >= 7
            ? withShortcuts
            : (() => {
                const savedAppearance = withShortcuts.settings.appearance;
                const selectedTheme =
                  themes[savedAppearance.theme] ?? themes["neon-violet"];
                return {
                  ...withShortcuts,
                  settings: {
                    ...withShortcuts.settings,
                    appearance: {
                      ...defaultSettings.appearance,
                      ...savedAppearance,
                      uiFontSize:
                        savedAppearance.uiFontSize === undefined ||
                        savedAppearance.uiFontSize === 11
                          ? 14
                          : savedAppearance.uiFontSize,
                      uiFontFamily:
                        savedAppearance.uiFontFamily ?? "system-ui",
                      terminalFontFamily:
                        savedAppearance.terminalFontFamily ??
                        fonts[savedAppearance.font ?? "cascadia"].label,
                      customPalette: {
                        ...paletteFromTheme(selectedTheme),
                        ...savedAppearance.customPalette,
                      },
                    },
                  },
                };
              })();
        const withWarpDefaults =
          version >= 8
            ? withAppearance
            : (() => {
                const withBrowserDefault = {
                  ...withAppearance,
                  workspaces: withAppearance.workspaces.map((workspace) => ({
                    ...workspace,
                    tabs: workspace.tabs.map((tab) =>
                      tab.kind === "browser" &&
                      (tab.browserUrl === "https://duckduckgo.com/" ||
                        tab.browserUrl === "https://duckduckgo.com")
                        ? { ...tab, browserUrl: "https://www.google.com/" }
                        : tab,
                    ),
                  })),
                };
                return {
                  ...withBrowserDefault,
                  settings: {
                    ...withBrowserDefault.settings,
                    shortcuts: Object.fromEntries(
                      (
                        Object.keys(
                          defaultSettings.shortcuts,
                        ) as ShortcutAction[]
                      ).map((action) => {
                        const savedValue =
                          withBrowserDefault.settings.shortcuts?.[action];
                        const oldDefault =
                          versionSevenShortcutDefaults[action];
                        return [
                          action,
                          savedValue === undefined ||
                          savedValue === oldDefault
                            ? defaultSettings.shortcuts[action]
                            : savedValue,
                        ];
                      }),
                    ) as Record<ShortcutAction, string>,
                  },
                };
              })();
        if (version >= 9) return withWarpDefaults;
        return {
          ...withWarpDefaults,
          settings: {
            ...withWarpDefaults.settings,
            terminal: {
              ...withWarpDefaults.settings.terminal,
              copyOnSelect: true,
            },
          },
        };
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
                customPalette: {
                  ...current.settings.appearance.customPalette,
                  ...saved.settings.appearance.customPalette,
                },
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
