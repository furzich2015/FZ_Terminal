import { useRef } from "react";
import type {
  AppSettings,
  CommandGroup,
  SplitNode,
  TerminalTab,
  ThemeDefinition,
  Workspace,
} from "../types";
import { useAppStore } from "../store/appStore";
import { TerminalPane } from "./TerminalPane";

interface SplitViewProps {
  node: SplitNode;
  nested?: boolean;
  workspace: Workspace;
  tab: TerminalTab;
  settings: AppSettings;
  theme: ThemeDefinition;
  commandGroups: CommandGroup[];
  onClosePane: (pane: SplitNode & { type: "pane" }) => void;
  onRenameTab: () => void;
  onOpenSettings: () => void;
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
    onClosePane,
    onRenameTab,
    onOpenSettings,
  } = props;
  const setActivePane = useAppStore((state) => state.setActivePane);
  const splitPane = useAppStore((state) => state.splitPane);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.type === "pane") {
    return (
      <TerminalPane
        key={node.id}
        pane={node}
        minimalChrome={!nested}
        active={node.id === tab.activePaneId}
        settings={settings}
        theme={theme}
        commandGroups={commandGroups}
        onFocus={() => setActivePane(workspace.id, tab.id, node.id)}
        onSplit={(direction) =>
          splitPane(workspace.id, tab.id, node.id, direction)
        }
        onClose={() => onClosePane(node)}
        onRenameTab={onRenameTab}
        onOpenSettings={onOpenSettings}
      />
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
