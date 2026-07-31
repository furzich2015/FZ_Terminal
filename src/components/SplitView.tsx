import { lazy, Suspense, useRef, useState } from "react";
import {
  Files,
  Globe2,
  LayoutGrid,
  SplitSquareHorizontal,
  SplitSquareVertical,
  StickyNote,
  TerminalSquare,
  X,
} from "lucide-react";
import type {
  AppSettings,
  CommandGroup,
  MenuPosition,
  SplitDirection,
  SplitNode,
  RemoteConnection,
  TabKind,
  TerminalTab,
  ThemeDefinition,
  Workspace,
} from "../types";
import { useAppStore } from "../store/appStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import type { FileTerminalAction } from "./FilesPane";
import { TerminalPane } from "./TerminalPane";

const BrowserPane = lazy(() =>
  import("./BrowserPane").then((module) => ({
    default: module.BrowserPane,
  })),
);
const FilesPane = lazy(() =>
  import("./FilesPane").then((module) => ({
    default: module.FilesPane,
  })),
);
const NotePane = lazy(() =>
  import("./NotePane").then((module) => ({
    default: module.NotePane,
  })),
);

type PaneNode = SplitNode & { type: "pane" };

interface SplitViewProps {
  node: SplitNode;
  nested?: boolean;
  workspace: Workspace;
  tab: TerminalTab;
  settings: AppSettings;
  theme: ThemeDefinition;
  commandGroups: CommandGroup[];
  browserVisible: boolean;
  onClosePane: (pane: PaneNode) => void;
  onTerminalExit: (pane: PaneNode) => void;
  onRenameTab: () => void;
  onOpenSettings: () => void;
  onOpenInTerminal: (
    path: string,
    directory: boolean,
    action?: FileTerminalAction,
    pattern?: string,
  ) => void;
  onOpenRemoteInTerminal: (
    connection: RemoteConnection,
    path: string,
    directory: boolean,
    action?: FileTerminalAction,
    pattern?: string,
  ) => void;
}

export function SplitView(props: SplitViewProps) {
  const {
    node,
    nested = false,
    workspace,
    tab,
    settings,
    theme,
    commandGroups,
    browserVisible,
    onClosePane,
    onTerminalExit,
    onRenameTab,
    onOpenSettings,
    onOpenInTerminal,
    onOpenRemoteInTerminal,
  } = props;
  const setActivePane = useAppStore((state) => state.setActivePane);
  const splitPane = useAppStore((state) => state.splitPane);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const updatePane = useAppStore((state) => state.updatePane);
  const addTab = useAppStore((state) => state.addTab);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paneMenu, setPaneMenu] = useState<MenuPosition | null>(null);

  if (node.type === "pane") {
    const kind = node.kind ?? tab.kind;
    const split = (direction: SplitDirection, nextKind: TabKind = kind) =>
      splitPane(workspace.id, tab.id, node.id, direction, nextKind);
    const focus = () => setActivePane(workspace.id, tab.id, node.id);
    return (
      <div
        className={`pane-cell ${node.id === tab.activePaneId ? "active" : ""}`}
        data-pane-id={node.id}
        data-pane-kind={kind}
        onMouseDown={focus}
        onContextMenu={(event) => {
          if (kind === "terminal" || event.defaultPrevented) return;
          event.preventDefault();
          focus();
          setPaneMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {kind === "terminal" && (
          <TerminalPane
            key={node.id}
            pane={node}
            workspaceId={workspace.id}
            minimalChrome={!nested}
            active={node.id === tab.activePaneId}
            settings={settings}
            theme={theme}
            commandGroups={commandGroups}
            onFocus={focus}
            onSplit={split}
            onClose={() => onClosePane(node)}
            onProcessExit={() => onTerminalExit(node)}
            onRenameTab={onRenameTab}
            onOpenSettings={onOpenSettings}
          />
        )}
        {kind === "browser" && (
          <Suspense fallback={null}>
            <BrowserPane
              id={node.id}
              tabs={
                node.browserTabs?.length
                  ? node.browserTabs
                  : [
                      {
                        id: node.id,
                        url:
                          node.browserUrl ??
                          tab.browserUrl ??
                          "https://www.google.com/",
                      },
                    ]
              }
              activeTabId={node.activeBrowserTabId ?? node.id}
              visible={browserVisible}
              onChange={(value) =>
                updatePane(workspace.id, tab.id, node.id, value)
              }
              onPaneContextMenu={setPaneMenu}
            />
          </Suspense>
        )}
        {kind === "files" && (
          <Suspense fallback={null}>
            <FilesPane
              workspaceId={workspace.id}
              initialPath={node.filePath ?? tab.filePath ?? "~"}
              initialRemotePath={node.remoteFilePath}
              remoteConnectionId={node.remoteConnectionId}
              onStateChange={(value) =>
                updatePane(workspace.id, tab.id, node.id, value)
              }
              onOpenInTerminal={onOpenInTerminal}
              onOpenRemoteInTerminal={onOpenRemoteInTerminal}
              onClosePane={() => onClosePane(node)}
            />
          </Suspense>
        )}
        {kind === "note" && (
          <Suspense fallback={null}>
            <NotePane
              key={node.id}
              initialContent={node.noteContent ?? tab.noteContent ?? ""}
              onNewTab={() => addTab(workspace.id, { kind: "note" })}
              onChange={(noteContent) =>
                updatePane(workspace.id, tab.id, node.id, { noteContent })
              }
            />
          </Suspense>
        )}
        {kind !== "terminal" && (
          <PaneActions
            kind={kind}
            position={paneMenu}
            onOpen={setPaneMenu}
            onMenuClose={() => setPaneMenu(null)}
            onSplit={split}
            onClose={() => onClosePane(node)}
          />
        )}
      </div>
    );
  }

  const updateRatio = (event: React.PointerEvent) => {
    if (!containerRef.current || event.buttons !== 1) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio =
      node.direction === "horizontal"
        ? (event.clientX - rect.left) / rect.width
        : (event.clientY - rect.top) / rect.height;
    setSplitRatio(workspace.id, tab.id, node.id, ratio);
  };

  const gridStyle =
    node.direction === "horizontal"
      ? {
          gridTemplateColumns: `${node.ratio}fr 6px ${1 - node.ratio}fr`,
          gridTemplateRows: "minmax(0, 1fr)",
        }
      : {
          gridTemplateRows: `${node.ratio}fr 6px ${1 - node.ratio}fr`,
          gridTemplateColumns: "minmax(0, 1fr)",
        };

  return (
    <div
      className={`split-view ${node.direction}`}
      ref={containerRef}
      style={gridStyle}
    >
      <div className="split-child">
        <SplitView {...props} node={node.first} nested />
      </div>
      <div
        className="split-divider"
        role="separator"
        aria-orientation={
          node.direction === "horizontal" ? "vertical" : "horizontal"
        }
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateRatio(event);
        }}
        onPointerMove={updateRatio}
      >
        <span />
      </div>
      <div className="split-child">
        <SplitView {...props} node={node.second} nested />
      </div>
    </div>
  );
}

function PaneActions({
  kind,
  position,
  onOpen,
  onMenuClose,
  onSplit,
  onClose,
}: {
  kind: TabKind;
  position: MenuPosition | null;
  onOpen: (position: MenuPosition) => void;
  onMenuClose: () => void;
  onSplit: (direction: SplitDirection, kind?: TabKind) => void;
  onClose: () => void;
}) {
  const sameKindName = paneKindLabels[kind];
  const kindItems = (direction: SplitDirection): ContextMenuItem[] =>
    (Object.keys(paneKindLabels) as TabKind[]).map((nextKind) => ({
      label: paneKindLabels[nextKind],
      icon: paneKindIcons[nextKind],
      action: () => onSplit(direction, nextKind),
    }));
  const items: ContextMenuItem[] = [
    {
      label: `Split right with ${sameKindName}`,
      icon: SplitSquareHorizontal,
      action: () => onSplit("horizontal", kind),
    },
    {
      label: "Split right with…",
      icon: SplitSquareHorizontal,
      children: kindItems("horizontal"),
    },
    {
      label: `Split below with ${sameKindName}`,
      icon: SplitSquareVertical,
      action: () => onSplit("vertical", kind),
    },
    {
      label: "Split below with…",
      icon: SplitSquareVertical,
      children: kindItems("vertical"),
    },
    { separator: true },
    {
      label: "Close pane",
      icon: X,
      danger: true,
      action: onClose,
    },
  ];
  return (
    <>
      <button
        className="pane-layout-button"
        type="button"
        title="Split or mix this pane"
        aria-label="Split or mix this pane"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onOpen({ x: rect.right - 250, y: rect.bottom + 4 });
        }}
      >
        <LayoutGrid size={12} />
      </button>
      <ContextMenu
        open={Boolean(position)}
        position={position ?? { x: 0, y: 0 }}
        items={items}
        onClose={onMenuClose}
      />
    </>
  );
}

const paneKindLabels: Record<TabKind, string> = {
  terminal: "Terminal",
  browser: "Browser",
  files: "Files",
  note: "Note",
};

const paneKindIcons = {
  terminal: TerminalSquare,
  browser: Globe2,
  files: Files,
  note: StickyNote,
} satisfies Record<TabKind, typeof TerminalSquare>;
