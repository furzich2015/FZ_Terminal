import { useEffect, useEffectEvent, useMemo, useState } from "react";
import type {
  ShortcutAction,
  TabKind,
  QuickCommand,
  RemoteConnection,
  SplitDirection,
  SplitNode,
  TerminalTab,
  Workspace,
} from "./types";
import { applyTheme, resolveTheme } from "./lib/themes";
import { useUpdateStatus } from "./hooks/useUpdateStatus";
import {
  collectBrowserPaneIds,
  collectSessionIds,
  defaultSettings,
  useAppStore,
} from "./store/appStore";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { WorkspaceBar } from "./components/WorkspaceBar";
import { SplitView } from "./components/SplitView";
import {
  SettingsModal,
  type SettingsSection,
} from "./components/SettingsModal";
import { ConfirmModal } from "./components/Modal";

interface PendingConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => void;
}

export function App() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore(
    (state) => state.activeWorkspaceId,
  );
  const settings = useAppStore((state) => state.settings);
  const commandGroups = useAppStore((state) => state.commandGroups);
  const sidebarVisible = useAppStore((state) => state.sidebarVisible);
  const setSidebarVisible = useAppStore(
    (state) => state.setSidebarVisible,
  );
  const setActiveWorkspace = useAppStore(
    (state) => state.setActiveWorkspace,
  );
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const closeWorkspace = useAppStore((state) => state.closeWorkspace);
  const addTab = useAppStore((state) => state.addTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const splitPane = useAppStore((state) => state.splitPane);
  const closePane = useAppStore((state) => state.closePane);
  const setActivePane = useAppStore((state) => state.setActivePane);

  const [settingsModal, setSettingsModal] = useState<{
    open: boolean;
    section: SettingsSection;
  }>({ open: false, section: "general" });
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const updateStatus = useUpdateStatus();

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const activeTab =
    activeWorkspace?.tabs.find(
      (tab) => tab.id === activeWorkspace.activeTabId,
    ) ?? activeWorkspace?.tabs[0];
  const activePane = activeTab
    ? findPane(activeTab.root, activeTab.activePaneId)
    : null;
  const activePaneKind = activePane?.kind ?? activeTab?.kind;
  const activeTerminalPane =
    activePane && activePaneKind === "terminal" ? activePane : null;
  const theme = useMemo(
    () => resolveTheme(settings.appearance),
    [settings.appearance],
  );

  useEffect(() => {
    applyTheme(theme, settings.appearance);
  }, [settings.appearance, theme]);

  useEffect(() => {
    const rendererOpacity = navigator.userAgent.includes("Linux")
      ? settings.appearance.interfaceOpacity
      : 1;
    document.documentElement.style.setProperty(
      "--window-opacity",
      String(rendererOpacity),
    );
    window.fzTerminal.window.setOpacity(settings.appearance.interfaceOpacity);
  }, [settings.appearance.interfaceOpacity]);

  useEffect(() => {
    if (
      activeWorkspace &&
      activeWorkspace.id !== activeWorkspaceId
    ) {
      setActiveWorkspace(activeWorkspace.id);
    }
  }, [activeWorkspace, activeWorkspaceId, setActiveWorkspace]);

  useEffect(() => {
    const openBrowser = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      if (!activeWorkspace || !url) return;
      addTab(activeWorkspace.id, { kind: "browser", browserUrl: url });
    };
    window.addEventListener("fz:open-browser", openBrowser);
    return () => window.removeEventListener("fz:open-browser", openBrowser);
  }, [activeWorkspace, addTab]);

  const handlers = {
    newWorkspace: () => addWorkspace(),
    newTab: () => addNewTab("terminal"),
    closeCurrentTab: () => {
      if (activeWorkspace && activeTab) {
        requestCloseTab(activeWorkspace, activeTab);
      }
    },
    splitHorizontal: () => splitActive("horizontal"),
    splitVertical: () => splitActive("vertical"),
    closeCurrentPane: () => {
      if (activeWorkspace && activeTab && activePane) {
        requestClosePane(activeWorkspace, activeTab, activePane);
      }
    },
    toggleSidebar: () => setSidebarVisible(!sidebarVisible),
    openSettings: () =>
      setSettingsModal({ open: true, section: "general" }),
    searchTerminal: () => {
      if (activeTerminalPane) {
        window.dispatchEvent(
          new CustomEvent("fz:search-terminal", {
            detail: activeTerminalPane.sessionId,
          }),
        );
      }
    },
    copyTerminal: () => {
      if (activeTerminalPane) {
        window.dispatchEvent(
          new CustomEvent("fz:copy-terminal", {
            detail: activeTerminalPane.sessionId,
          }),
        );
      }
    },
    pasteTerminal: () => {
      if (activeTerminalPane) {
        window.dispatchEvent(
          new CustomEvent("fz:paste-terminal", {
            detail: activeTerminalPane.sessionId,
          }),
        );
      }
    },
    sendInterrupt: () => {
      if (activeTerminalPane) {
        window.fzTerminal.pty.write(activeTerminalPane.sessionId, "\x03");
        window.dispatchEvent(
          new CustomEvent("fz:clear-input", {
            detail: activeTerminalPane.sessionId,
          }),
        );
      }
    },
    clearInput: () => {
      if (activeTerminalPane) {
        window.fzTerminal.pty.write(activeTerminalPane.sessionId, "\x15");
        window.dispatchEvent(
          new CustomEvent("fz:clear-input", {
            detail: activeTerminalPane.sessionId,
          }),
        );
      }
    },
    nextWorkspace: () => cycleWorkspace(1),
    previousWorkspace: () => cycleWorkspace(-1),
    commandPalette: () => {
      setSidebarVisible(true);
      requestAnimationFrame(() =>
        window.dispatchEvent(new Event("fz:focus-command-palette")),
      );
    },
    clearTerminal: () => {
      if (activeTerminalPane) {
        window.fzTerminal.pty.write(activeTerminalPane.sessionId, "\x0c");
      }
    },
    showCompletions: () => {
      if (activeTerminalPane && settings.terminal.fileCompletion) {
        window.dispatchEvent(
          new CustomEvent("fz:show-completions", {
            detail: activeTerminalPane.sessionId,
          }),
        );
      }
    },
    nextTab: () => cycleTab(1),
    previousTab: () => cycleTab(-1),
    activateTab: (index: number, last = false) => activateTab(index, last),
    focusPane: (
      direction: "left" | "right" | "up" | "down",
    ) => focusPane(direction),
    toggleMaximizePane: () => {
      if (!activeTerminalPane) return;
      window.dispatchEvent(
        new CustomEvent("fz:toggle-maximize-pane", {
          detail: activeTerminalPane.sessionId,
        }),
      );
    },
    zoomIn: () => adjustFontSize(1),
    zoomOut: () => adjustFontSize(-1),
    resetFontSize: () =>
      useAppStore.getState().updateAppearance({
        fontSize: defaultSettings.appearance.fontSize,
      }),
  };

  const onGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const terminalInput = target?.classList.contains(
      "xterm-helper-textarea",
    );
    if (
      !terminalInput &&
      (target?.matches("input, textarea, select") ||
        target?.isContentEditable)
    ) {
      return;
    }

    const actions: Record<ShortcutAction, () => void> = {
      newTab: handlers.newTab,
      closeTab: activePane
        ? handlers.closeCurrentPane
        : handlers.closeCurrentTab,
      nextTab: handlers.nextTab,
      previousTab: handlers.previousTab,
      activateTab1: () => handlers.activateTab(0),
      activateTab2: () => handlers.activateTab(1),
      activateTab3: () => handlers.activateTab(2),
      activateTab4: () => handlers.activateTab(3),
      activateTab5: () => handlers.activateTab(4),
      activateTab6: () => handlers.activateTab(5),
      activateTab7: () => handlers.activateTab(6),
      activateTab8: () => handlers.activateTab(7),
      activateLastTab: () => handlers.activateTab(-1, true),
      newWorkspace: handlers.newWorkspace,
      nextWorkspace: handlers.nextWorkspace,
      previousWorkspace: handlers.previousWorkspace,
      splitHorizontal: handlers.splitHorizontal,
      splitVertical: handlers.splitVertical,
      closePane: activePane
        ? handlers.closeCurrentPane
        : handlers.closeCurrentTab,
      focusPaneLeft: () => handlers.focusPane("left"),
      focusPaneRight: () => handlers.focusPane("right"),
      focusPaneUp: () => handlers.focusPane("up"),
      focusPaneDown: () => handlers.focusPane("down"),
      toggleMaximizePane: handlers.toggleMaximizePane,
      toggleSidebar: handlers.toggleSidebar,
      commandPalette: handlers.commandPalette,
      openSettings: handlers.openSettings,
      searchTerminal: handlers.searchTerminal,
      copyTerminal: handlers.copyTerminal,
      pasteTerminal: handlers.pasteTerminal,
      sendInterrupt: handlers.sendInterrupt,
      clearInput: handlers.clearInput,
      clearTerminal: handlers.clearTerminal,
      showCompletions: handlers.showCompletions,
      zoomIn: handlers.zoomIn,
      zoomOut: handlers.zoomOut,
      resetFontSize: handlers.resetFontSize,
    };

    for (const [action, shortcut] of Object.entries(
      settings.shortcuts,
    ) as [ShortcutAction, string][]) {
      if (!matchesShortcut(event, shortcut)) continue;
      event.preventDefault();
      event.stopPropagation();
      actions[action]();
      break;
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onGlobalKeyDown(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function cycleWorkspace(delta: number) {
    if (workspaces.length < 2 || !activeWorkspace) return;
    const index = workspaces.findIndex(
      (workspace) => workspace.id === activeWorkspace.id,
    );
    const next =
      workspaces[
        (index + delta + workspaces.length) % workspaces.length
      ];
    setActiveWorkspace(next.id);
  }

  function cycleTab(delta: number) {
    if (!activeWorkspace || activeWorkspace.tabs.length < 2) return;
    const index = activeWorkspace.tabs.findIndex(
      (tab) => tab.id === activeWorkspace.activeTabId,
    );
    const next =
      activeWorkspace.tabs[
        (index + delta + activeWorkspace.tabs.length) %
          activeWorkspace.tabs.length
      ];
    setActiveTab(activeWorkspace.id, next.id);
  }

  function activateTab(index: number, last = false) {
    if (!activeWorkspace || activeWorkspace.tabs.length === 0) return;
    const target = last
      ? activeWorkspace.tabs.at(-1)
      : activeWorkspace.tabs[index];
    if (target) setActiveTab(activeWorkspace.id, target.id);
  }

  function focusPane(direction: "left" | "right" | "up" | "down") {
    if (!activeWorkspace || !activeTab || !activePane) return;
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        ".pane-cell[data-pane-id]",
      ),
    ];
    const current = elements.find(
      (element) => element.dataset.paneId === activePane.id,
    );
    if (!current) return;
    const origin = centerOf(current.getBoundingClientRect());
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    const candidate = elements
      .filter((element) => element !== current)
      .map((element) => {
        const center = centerOf(element.getBoundingClientRect());
        const primary =
          sign *
          (horizontal ? center.x - origin.x : center.y - origin.y);
        const secondary = Math.abs(
          horizontal ? center.y - origin.y : center.x - origin.x,
        );
        return { element, primary, score: primary * 10 + secondary };
      })
      .filter(({ primary }) => primary > 1)
      .sort((left, right) => left.score - right.score)[0];
    const paneId = candidate?.element.dataset.paneId;
    if (paneId) {
      setActivePane(activeWorkspace.id, activeTab.id, paneId);
      candidate.element
        .querySelector<HTMLElement>(
          ".xterm-helper-textarea, input, textarea, button",
        )
        ?.focus();
    }
  }

  function adjustFontSize(delta: number) {
    const fontSize = Math.min(
      30,
      Math.max(9, settings.appearance.fontSize + delta),
    );
    useAppStore.getState().updateAppearance({ fontSize });
  }

  function splitActive(direction: SplitDirection) {
    if (!activeWorkspace || !activeTab || !activePane) return;
    splitPane(
      activeWorkspace.id,
      activeTab.id,
      activePane.id,
      direction,
    );
  }

  function addNewTab(kind: TabKind) {
    if (activeWorkspace) addTab(activeWorkspace.id, { kind });
  }

  function duplicateTab(tab: TerminalTab) {
    if (!activeWorkspace) return;
    const sourcePane = findFirstPaneByKind(tab.root, tab.kind);
    addTab(activeWorkspace.id, {
      kind: tab.kind,
      name: `${tab.name} copy`,
      browserUrl: sourcePane?.browserUrl ?? tab.browserUrl,
      filePath: sourcePane?.filePath ?? tab.filePath,
      noteContent: sourcePane?.noteContent ?? tab.noteContent,
    });
  }

  function runCommand(command: QuickCommand) {
    const target = getTerminalTarget();
    if (!target) return;
    const fastExecution = command.fastExecution ?? true;
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("fz:quick-command", {
          detail: {
            sessionId: target.sessionId,
            command: command.command,
            execute: fastExecution,
          },
        }),
      );
      window.fzTerminal.pty.write(
        target.sessionId,
        `${command.command}${fastExecution ? "\r" : ""}`,
      );
    }, target.delay);
  }

  function getTerminalTarget() {
    if (!activeWorkspace) return null;
    let workspace = activeWorkspace;
    let tab: TerminalTab | undefined = activeTab;
    let pane =
      tab && findFirstPaneByKind(tab.root, "terminal");
    if (!pane) {
      tab = workspace.tabs.find((item) =>
        Boolean(findFirstPaneByKind(item.root, "terminal")),
      );
      pane = tab ? findFirstPaneByKind(tab.root, "terminal") : null;
    }
    let delay = 0;
    if (!tab || !pane) {
      const created = addTab(workspace.id, { kind: "terminal" });
      workspace =
        useAppStore
          .getState()
          .workspaces.find((item) => item.id === workspace.id) ?? workspace;
      tab = workspace.tabs.find((item) => item.id === created.tabId);
      pane = tab ? findFirstPaneByKind(tab.root, "terminal") : null;
      delay = 120;
    } else if (tab.id !== workspace.activeTabId) {
      setActiveTab(workspace.id, tab.id);
      delay = 50;
    }
    if (!tab || !pane) return null;
    if (tab.activePaneId !== pane.id) {
      setActivePane(workspace.id, tab.id, pane.id);
    }
    return pane ? { sessionId: pane.sessionId, delay } : null;
  }

  function openPathInTerminal(
    path: string,
    directory: boolean,
    action: "cat" | "nano" | "less" | "grep" = "cat",
    pattern = "",
  ) {
    const target = getTerminalTarget();
    if (!target) return;
    const quotedPath = quoteShell(path);
    const command = directory
      ? `cd -- ${quotedPath}`
      : action === "nano"
        ? `nano -- ${quotedPath}`
        : action === "less"
          ? `less -- ${quotedPath}`
          : action === "grep"
            ? `grep --color=always -n -- ${quoteShell(pattern)} ${quotedPath}`
            : `cat -- ${quotedPath}`;
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("fz:quick-command", {
          detail: {
            sessionId: target.sessionId,
            command,
            execute: true,
          },
        }),
      );
      window.fzTerminal.pty.write(target.sessionId, `${command}\r`);
    }, target.delay);
  }

  function openRemotePathInTerminal(
    connection: RemoteConnection,
    remotePath: string,
    directory: boolean,
    action: "cat" | "nano" | "less" | "grep" = "cat",
    pattern = "",
  ) {
    const target = getTerminalTarget();
    if (!target) return;
    const quotedPath = quoteShell(remotePath);
    const remoteCommand = directory
      ? `cd -- ${quotedPath} && exec "\${SHELL:-/bin/sh}" -l`
      : action === "nano"
        ? `nano -- ${quotedPath}`
        : action === "less"
          ? `less -- ${quotedPath}`
          : action === "grep"
            ? `grep --color=always -n -- ${quoteShell(pattern)} ${quotedPath}`
            : `cat -- ${quotedPath}`;
    void window.fzTerminal.files
      .remoteTerminalArgs(connection, remoteCommand)
      .then((sshArguments) => {
        const command = `ssh ${sshArguments.map(quoteShell).join(" ")}`;
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("fz:quick-command", {
              detail: {
                sessionId: target.sessionId,
                command,
                execute: true,
              },
            }),
          );
          window.fzTerminal.pty.write(target.sessionId, `${command}\r`);
        }, target.delay);
      })
      .catch(() => undefined);
  }

  function killSessions(node: SplitNode) {
    for (const sessionId of collectSessionIds(node)) {
      window.fzTerminal.pty.kill(sessionId);
    }
  }

  function performCloseTab(workspace: Workspace, tab: TerminalTab) {
    killSessions(tab.root);
    for (const id of collectBrowserPaneIds(tab.root)) {
      window.fzTerminal.browser.destroy(id);
    }
    closeTab(workspace.id, tab.id);
  }

  function requestCloseTab(workspace: Workspace, tab: TerminalTab) {
    const run = () => performCloseTab(workspace, tab);
    if (!settings.general.confirmBeforeClose) {
      run();
      return;
    }
    setPendingConfirmation({
      title: `Close “${tab.name}”?`,
      message:
        collectSessionIds(tab.root).length > 0
          ? "The running shell processes in this tab will be terminated."
          : "This tab will be closed.",
      confirmLabel: "Close tab",
      run,
    });
  }

  function performClosePane(
    workspace: Workspace,
    tab: TerminalTab,
    pane: SplitNode & { type: "pane" },
  ) {
    if (tab.root.type === "pane") {
      performCloseTab(workspace, tab);
      return;
    }
    const kind = pane.kind ?? tab.kind;
    if (kind === "terminal") window.fzTerminal.pty.kill(pane.sessionId);
    if (kind === "browser") {
      for (const id of collectBrowserPaneIds(pane)) {
        window.fzTerminal.browser.destroy(id);
      }
    }
    closePane(workspace.id, tab.id, pane.id);
  }

  function requestClosePane(
    workspace: Workspace,
    tab: TerminalTab,
    pane: SplitNode & { type: "pane" },
  ) {
    const run = () => performClosePane(workspace, tab, pane);
    if (!settings.general.confirmBeforeClose) {
      run();
      return;
    }
    setPendingConfirmation({
      title: "Close this pane?",
      message:
        (pane.kind ?? tab.kind) === "terminal"
          ? "The shell process running in this pane will be terminated."
          : "This pane will be closed.",
      confirmLabel: "Close pane",
      run,
    });
  }

  function performCloseWorkspace(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    for (const tab of workspace.tabs) {
      killSessions(tab.root);
      for (const id of collectBrowserPaneIds(tab.root)) {
        window.fzTerminal.browser.destroy(id);
      }
    }
    closeWorkspace(workspaceId);
  }

  if (!activeWorkspace || !activeTab) {
    return <div className="boot-screen">Preparing terminal…</div>;
  }

  return (
    <div
      className={`app-shell ${
        settings.general.compactInterface ? "compact" : ""
      }`}
    >
      <TitleBar
        sidebarVisible={sidebarVisible}
        terminalActive={activePaneKind === "terminal"}
        onToggleSidebar={handlers.toggleSidebar}
        onSplitHorizontal={handlers.splitHorizontal}
        onOpenSettings={handlers.openSettings}
        onOpenUpdates={() =>
          setSettingsModal({ open: true, section: "updates" })
        }
        onSearchTerminal={handlers.searchTerminal}
        updateStatus={updateStatus}
      >
        <TabBar
          workspace={activeWorkspace}
          showActions={false}
          onNewTab={addNewTab}
          onCloseTab={(tab) => requestCloseTab(activeWorkspace, tab)}
          onDuplicateTab={duplicateTab}
          onSplitHorizontal={handlers.splitHorizontal}
          onSplitVertical={handlers.splitVertical}
          onOverflowChange={setTabsOverflowing}
        />
      </TitleBar>

      <div className="app-content">
        <main className="terminal-workspace">
          <div className="terminal-stage">
            <SplitView
              node={activeTab.root}
              workspace={activeWorkspace}
              tab={activeTab}
              settings={settings}
              theme={theme}
              commandGroups={commandGroups}
              browserVisible={!settingsModal.open && !pendingConfirmation}
              onClosePane={(pane) =>
                requestClosePane(activeWorkspace, activeTab, pane)
              }
              onTerminalExit={(pane) =>
                performClosePane(activeWorkspace, activeTab, pane)
              }
              onRenameTab={() =>
                window.dispatchEvent(
                  new CustomEvent("fz:rename-tab", {
                    detail: activeTab.id,
                  }),
                )
              }
              onOpenSettings={() =>
                setSettingsModal({ open: true, section: "terminal" })
              }
              onOpenInTerminal={openPathInTerminal}
              onOpenRemoteInTerminal={openRemotePathInTerminal}
            />
          </div>
        </main>
        {sidebarVisible && (
          <Sidebar
            onRunCommand={runCommand}
            onOpenSettings={handlers.openSettings}
            onClose={handlers.toggleSidebar}
          />
        )}
      </div>

      <div className="workspace-dock">
        <WorkspaceBar
          compactBrand={tabsOverflowing}
          onNewWorkspace={handlers.newWorkspace}
          onCloseWorkspace={performCloseWorkspace}
        />
      </div>

      {settingsModal.open && (
        <SettingsModal
          open
          initialSection={settingsModal.section}
          onClose={() =>
            setSettingsModal((current) => ({ ...current, open: false }))
          }
          onShowCommands={() => setSidebarVisible(true)}
        />
      )}
      <ConfirmModal
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title ?? ""}
        message={pendingConfirmation?.message ?? ""}
        confirmLabel={pendingConfirmation?.confirmLabel}
        danger
        onConfirm={() => pendingConfirmation?.run()}
        onClose={() => setPendingConfirmation(null)}
      />
    </div>
  );
}

function findPane(
  node: SplitNode,
  paneId: string,
): (SplitNode & { type: "pane" }) | null {
  if (node.type === "pane") return node.id === paneId ? node : null;
  return findPane(node.first, paneId) ?? findPane(node.second, paneId);
}

function findFirstPaneByKind(
  node: SplitNode,
  kind: TabKind,
): (SplitNode & { type: "pane" }) | null {
  if (node.type === "pane") {
    return (node.kind ?? "terminal") === kind ? node : null;
  }
  return (
    findFirstPaneByKind(node.first, kind) ??
    findFirstPaneByKind(node.second, kind)
  );
}

function quoteShell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function centerOf(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1)?.toLowerCase();
  const wantsPrimary = parts.some(
    (part) => part.toLowerCase() === "primary",
  );
  const wantsCtrl = parts.some((part) => part.toLowerCase() === "ctrl");
  const wantsMeta = parts.some(
    (part) => ["meta", "cmd", "command"].includes(part.toLowerCase()),
  );
  const wantsAlt = parts.some((part) => part.toLowerCase() === "alt");
  const wantsShift = parts.some((part) => part.toLowerCase() === "shift");

  const keyMatches =
    event.key.toLowerCase() === key ||
    event.code.toLowerCase() === key?.replace("arrow", "arrow");
  return (
    keyMatches &&
    (!wantsPrimary || event.ctrlKey || event.metaKey) &&
    (!wantsCtrl || event.ctrlKey) &&
    (!wantsMeta || event.metaKey) &&
    event.altKey === wantsAlt &&
    event.shiftKey === wantsShift
  );
}
