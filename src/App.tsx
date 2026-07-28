import { useEffect, useEffectEvent, useState } from "react";
import type {
  ShortcutAction,
  TabKind,
  QuickCommand,
  SplitDirection,
  SplitNode,
  TerminalTab,
  Workspace,
} from "./types";
import { applyTheme, themes } from "./lib/themes";
import { useUpdateStatus } from "./hooks/useUpdateStatus";
import {
  collectSessionIds,
  useAppStore,
} from "./store/appStore";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { SplitView } from "./components/SplitView";
import {
  SettingsModal,
  type SettingsSection,
} from "./components/SettingsModal";
import { ConfirmModal } from "./components/Modal";
import { BrowserPane } from "./components/BrowserPane";
import { FilesPane } from "./components/FilesPane";
import { NotePane } from "./components/NotePane";

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
  const updateTab = useAppStore((state) => state.updateTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const splitPane = useAppStore((state) => state.splitPane);
  const closePane = useAppStore((state) => state.closePane);

  const [settingsModal, setSettingsModal] = useState<{
    open: boolean;
    section: SettingsSection;
  }>({ open: false, section: "general" });
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const updateStatus = useUpdateStatus();

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const activeTab =
    activeWorkspace?.tabs.find(
      (tab) => tab.id === activeWorkspace.activeTabId,
    ) ?? activeWorkspace?.tabs[0];
  const activePane = activeTab?.kind === "terminal"
    ? findPane(activeTab.root, activeTab.activePaneId)
    : null;
  const theme = themes[settings.appearance.theme];

  useEffect(() => {
    applyTheme(settings.appearance.theme);
    document.documentElement.style.setProperty(
      "--ui-font-size",
      `${settings.appearance.uiFontSize}px`,
    );
  }, [settings.appearance.theme, settings.appearance.uiFontSize]);

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
      if (activePane) {
        window.dispatchEvent(
          new CustomEvent("fz:search-terminal", {
            detail: activePane.sessionId,
          }),
        );
      }
    },
    copyTerminal: () => {
      if (activePane) {
        window.dispatchEvent(
          new CustomEvent("fz:copy-terminal", {
            detail: activePane.sessionId,
          }),
        );
      }
    },
    pasteTerminal: () => {
      if (activePane) {
        window.dispatchEvent(
          new CustomEvent("fz:paste-terminal", {
            detail: activePane.sessionId,
          }),
        );
      }
    },
    sendInterrupt: () => {
      if (activePane) {
        window.fzTerminal.pty.write(activePane.sessionId, "\x03");
        window.dispatchEvent(
          new CustomEvent("fz:clear-input", {
            detail: activePane.sessionId,
          }),
        );
      }
    },
    clearInput: () => {
      if (activePane) {
        window.fzTerminal.pty.write(activePane.sessionId, "\x15");
        window.dispatchEvent(
          new CustomEvent("fz:clear-input", {
            detail: activePane.sessionId,
          }),
        );
      }
    },
    nextWorkspace: () => cycleWorkspace(1),
    previousWorkspace: () => cycleWorkspace(-1),
    clearTerminal: () => {
      if (activePane) {
        window.fzTerminal.pty.write(activePane.sessionId, "\x0c");
      }
    },
    showCompletions: () => {
      if (activePane && settings.terminal.fileCompletion) {
        window.dispatchEvent(
          new CustomEvent("fz:show-completions", {
            detail: activePane.sessionId,
          }),
        );
      }
    },
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
      closeTab: handlers.closeCurrentTab,
      newWorkspace: handlers.newWorkspace,
      nextWorkspace: handlers.nextWorkspace,
      previousWorkspace: handlers.previousWorkspace,
      splitHorizontal: handlers.splitHorizontal,
      splitVertical: handlers.splitVertical,
      closePane: handlers.closeCurrentPane,
      toggleSidebar: handlers.toggleSidebar,
      openSettings: handlers.openSettings,
      searchTerminal: handlers.searchTerminal,
      copyTerminal: handlers.copyTerminal,
      pasteTerminal: handlers.pasteTerminal,
      sendInterrupt: handlers.sendInterrupt,
      clearInput: handlers.clearInput,
      clearTerminal: handlers.clearTerminal,
      showCompletions: handlers.showCompletions,
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
    addTab(activeWorkspace.id, {
      kind: tab.kind,
      name: `${tab.name} copy`,
      browserUrl: tab.browserUrl,
      filePath: tab.filePath,
      noteContent: tab.noteContent,
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
    let tab =
      activeTab?.kind === "terminal"
        ? activeTab
        : workspace.tabs.find((item) => item.kind === "terminal");
    let delay = 0;
    if (!tab) {
      const created = addTab(workspace.id, { kind: "terminal" });
      workspace =
        useAppStore
          .getState()
          .workspaces.find((item) => item.id === workspace.id) ?? workspace;
      tab = workspace.tabs.find((item) => item.id === created.tabId);
      delay = 120;
    } else if (tab.id !== workspace.activeTabId) {
      setActiveTab(workspace.id, tab.id);
      delay = 50;
    }
    if (!tab) return null;
    const pane = findPane(tab.root, tab.activePaneId);
    return pane ? { sessionId: pane.sessionId, delay } : null;
  }

  function openPathInTerminal(path: string, directory: boolean) {
    const target = getTerminalTarget();
    if (!target) return;
    const command = directory
      ? `cd -- ${quoteShell(path)}`
      : `\${VISUAL:-\${EDITOR:-nano}} -- ${quoteShell(path)}`;
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

  function killSessions(node: SplitNode) {
    for (const sessionId of collectSessionIds(node)) {
      window.fzTerminal.pty.kill(sessionId);
    }
  }

  function performCloseTab(workspace: Workspace, tab: TerminalTab) {
    if (tab.kind === "terminal") killSessions(tab.root);
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
        tab.kind === "terminal"
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
    window.fzTerminal.pty.kill(pane.sessionId);
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
      message: "The shell process running in this pane will be terminated.",
      confirmLabel: "Close pane",
      run,
    });
  }

  function performCloseWorkspace(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    for (const tab of workspace.tabs) {
      if (tab.kind === "terminal") killSessions(tab.root);
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
        terminalActive={activeTab.kind === "terminal"}
        onToggleSidebar={handlers.toggleSidebar}
        onNewWorkspace={handlers.newWorkspace}
        onCloseWorkspace={performCloseWorkspace}
        onOpenSettings={handlers.openSettings}
        onOpenUpdates={() =>
          setSettingsModal({ open: true, section: "updates" })
        }
        onSearchTerminal={handlers.searchTerminal}
        updateStatus={updateStatus}
      />

      <div className="app-content">
        {sidebarVisible && (
          <Sidebar
            onRunCommand={runCommand}
            onOpenSettings={handlers.openSettings}
          />
        )}
        <main className="terminal-workspace">
          <TabBar
            workspace={activeWorkspace}
            onNewTab={addNewTab}
            onCloseTab={(tab) => requestCloseTab(activeWorkspace, tab)}
            onDuplicateTab={duplicateTab}
            onSplitHorizontal={handlers.splitHorizontal}
            onSplitVertical={handlers.splitVertical}
          />
          <div className="terminal-stage">
            {activeTab.kind === "terminal" && (
              <SplitView
                node={activeTab.root}
                workspace={activeWorkspace}
                tab={activeTab}
                settings={settings}
                theme={theme}
                commandGroups={commandGroups}
                onClosePane={(pane) =>
                  requestClosePane(activeWorkspace, activeTab, pane)
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
              />
            )}
            {activeTab.kind === "browser" && (
              <BrowserPane
                id={activeTab.id}
                initialUrl={
                  activeTab.browserUrl ?? "https://duckduckgo.com/"
                }
                visible={!settingsModal.open && !pendingConfirmation}
                onUrlChange={(browserUrl) =>
                  updateTab(activeWorkspace.id, activeTab.id, {
                    browserUrl,
                  })
                }
              />
            )}
            {activeTab.kind === "files" && (
              <FilesPane
                initialPath={activeTab.filePath ?? "~"}
                onPathChange={(filePath) =>
                  updateTab(activeWorkspace.id, activeTab.id, { filePath })
                }
                onOpenInTerminal={openPathInTerminal}
              />
            )}
            {activeTab.kind === "note" && (
              <NotePane
                initialContent={activeTab.noteContent ?? ""}
                onChange={(noteContent) =>
                  updateTab(activeWorkspace.id, activeTab.id, {
                    noteContent,
                  })
                }
              />
            )}
          </div>
        </main>
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

function quoteShell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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
