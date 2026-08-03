import { describe, expect, it } from "vitest";
import type { CommandGroup, SplitNode, Workspace } from "../types";
import {
  collectBrowserPaneIds,
  collectSessionIds,
  defaultSettings,
  removePane,
  splitNode,
  useAppStore,
} from "./appStore";
import { resolveTheme } from "../lib/themes";

const pane = (id: string): SplitNode => ({
  type: "pane",
  id,
  sessionId: `session-${id}`,
});

describe("split tree", () => {
  it("adds a second pane without replacing the first session", () => {
    const next = pane("two") as SplitNode & { type: "pane" };
    const root = splitNode(pane("one"), "one", "horizontal", next);

    expect(collectSessionIds(root)).toEqual(["session-one", "session-two"]);
  });

  it("collapses the parent when a pane is closed", () => {
    const next = pane("two") as SplitNode & { type: "pane" };
    const root = splitNode(pane("one"), "one", "vertical", next);

    expect(removePane(root, "one")).toEqual(next);
  });

  it("tracks terminal and browser resources independently in mixed splits", () => {
    const browser: SplitNode & { type: "pane" } = {
      type: "pane",
      id: "browser-one",
      sessionId: "unused-browser-session",
      kind: "browser",
      browserUrl: "https://example.com/",
      browserTabs: [
        { id: "browser-page-one", url: "https://example.com/" },
        { id: "browser-page-two", url: "https://example.org/" },
      ],
      activeBrowserTabId: "browser-page-one",
    };
    const root = splitNode(pane("terminal"), "terminal", "horizontal", browser);

    expect(collectSessionIds(root)).toEqual(["session-terminal"]);
    expect(collectBrowserPaneIds(root)).toEqual([
      "browser-page-one",
      "browser-page-two",
    ]);
  });
});

describe("drag ordering", () => {
  it("reorders workspaces, tabs, folders, and commands", () => {
    const original = useAppStore.getState();
    const baseWorkspace = original.workspaces[0];
    const baseTab = baseWorkspace.tabs[0];
    const workspaceOne: Workspace = {
      ...baseWorkspace,
      id: "workspace-one",
      tabs: [
        { ...baseTab, id: "tab-one", name: "One" },
        { ...baseTab, id: "tab-two", name: "Two" },
      ],
      activeTabId: "tab-one",
    };
    const workspaceTwo: Workspace = {
      ...baseWorkspace,
      id: "workspace-two",
      name: "Two",
    };
    const groups: CommandGroup[] = [
      {
        id: "group-one",
        name: "One",
        expanded: true,
        commands: [
          {
            id: "command-one",
            name: "One",
            command: "echo one",
            fastExecution: true,
          },
        ],
      },
      {
        id: "group-two",
        name: "Two",
        expanded: true,
        commands: [
          {
            id: "command-two",
            name: "Two",
            command: "echo two",
            fastExecution: true,
          },
        ],
      },
    ];

    try {
      useAppStore.setState({
        workspaces: [workspaceOne, workspaceTwo],
        activeWorkspaceId: workspaceOne.id,
        commandGroups: groups,
      });
      useAppStore.getState().moveWorkspace("workspace-two", "workspace-one");
      useAppStore.getState().moveTab("workspace-one", "tab-two", "tab-one");
      useAppStore.getState().moveCommandGroup("group-two", "group-one");
      useAppStore
        .getState()
        .moveCommand("group-one", "command-one", "group-two", "command-two");

      const next = useAppStore.getState();
      expect(next.workspaces.map((workspace) => workspace.id)).toEqual([
        "workspace-two",
        "workspace-one",
      ]);
      expect(
        next.workspaces
          .find((workspace) => workspace.id === "workspace-one")
          ?.tabs.map((tab) => tab.id),
      ).toEqual(["tab-two", "tab-one"]);
      expect(next.commandGroups.map((group) => group.id)).toEqual([
        "group-two",
        "group-one",
      ]);
      expect(next.commandGroups[0].commands.map((command) => command.id)).toEqual(
        ["command-one", "command-two"],
      );
    } finally {
      useAppStore.setState({
        workspaces: original.workspaces,
        activeWorkspaceId: original.activeWorkspaceId,
        commandGroups: original.commandGroups,
      });
    }
  });
});

describe("appearance customization", () => {
  it("uses a readable 14px UI default and applies custom colors live", () => {
    expect(defaultSettings.appearance.uiFontSize).toBe(14);
    expect(defaultSettings.appearance.uiFontFamily).toBe("system-ui");
    expect(defaultSettings.terminal.copyOnSelect).toBe(true);

    const appearance = {
      ...defaultSettings.appearance,
      advancedColors: true,
      opacity: 0.5,
      customPalette: {
        ...defaultSettings.appearance.customPalette,
        accent: "#12abde",
        terminalBackground: "#101820",
      },
    };
    const theme = resolveTheme(appearance);

    expect(theme.ui.accent).toBe("#12abde");
    expect(theme.xterm.background).toBe("rgba(16, 24, 32, 0.5)");
  });
});

describe("detected SSH connections", () => {
  it("keeps the identity file used by the terminal session", () => {
    const original = useAppStore.getState();
    try {
      useAppStore.setState({ connections: [] });
      const id = useAppStore.getState().upsertDetectedConnection(
        original.workspaces[0].id,
        {
          host: "server.internal",
          user: "root",
          port: 22,
          identityFile: "/opt/fz-test/server-key",
        },
      );

      expect(
        useAppStore.getState().connections.find((item) => item.id === id)
          ?.identityFile,
      ).toBe("/opt/fz-test/server-key");
    } finally {
      useAppStore.setState({ connections: original.connections });
    }
  });
});
