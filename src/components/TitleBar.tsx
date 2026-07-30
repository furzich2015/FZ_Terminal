import { useEffect, useState, type ReactNode } from "react";
import {
  Columns2,
  Download,
  LoaderCircle,
  Maximize2,
  Minus,
  Search,
  Settings,
  Zap,
  X,
} from "lucide-react";
import type { UpdateStatus } from "../types";

interface TitleBarProps {
  children: ReactNode;
  sidebarVisible: boolean;
  terminalActive: boolean;
  onToggleSidebar: () => void;
  onSplitHorizontal: () => void;
  onOpenSettings: () => void;
  onOpenUpdates: () => void;
  onSearchTerminal: () => void;
  updateStatus: UpdateStatus;
}

export function TitleBar({
  children,
  sidebarVisible,
  terminalActive,
  onToggleSidebar,
  onSplitHorizontal,
  onOpenSettings,
  onOpenUpdates,
  onSearchTerminal,
  updateStatus,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const showUpdate =
    updateStatus.state === "available" ||
    updateStatus.state === "downloading" ||
    updateStatus.state === "downloaded";

  useEffect(() => {
    void window.fzTerminal.window.isMaximized().then(setMaximized);
    return window.fzTerminal.window.onMaximized(setMaximized);
  }, []);

  return (
    <header className="titlebar">
      <div className="titlebar-leading">
        <div className="traffic-lights no-drag">
          <button
            className="traffic-light close"
            aria-label="Close"
            type="button"
            onClick={window.fzTerminal.window.close}
          >
            <X size={10} strokeWidth={2.4} />
          </button>
          <button
            className="traffic-light minimize"
            aria-label="Minimize"
            type="button"
            onClick={window.fzTerminal.window.minimize}
          >
            <Minus size={10} strokeWidth={2.4} />
          </button>
          <button
            className="traffic-light maximize"
            aria-label={maximized ? "Restore" : "Maximize"}
            type="button"
            onClick={window.fzTerminal.window.toggleMaximize}
          >
            <Maximize2 size={9} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="titlebar-tabs">{children}</div>

      <div className="titlebar-actions no-drag">
        {showUpdate && (
          <button
            className={`toolbar-button update-indicator ${updateStatus.state}`}
            type="button"
            title={updateStatus.message}
            onClick={onOpenUpdates}
          >
            {updateStatus.state === "downloading" ? (
              <LoaderCircle size={14} />
            ) : (
              <Download size={14} />
            )}
          </button>
        )}
        <button
          className="toolbar-button"
          type="button"
          title="Search terminal"
          disabled={!terminalActive}
          onClick={onSearchTerminal}
        >
          <Search size={14} />
        </button>
        <button
          className="toolbar-button"
          type="button"
          title="Split active pane left / right"
          onClick={onSplitHorizontal}
        >
          <Columns2 size={14} />
        </button>
        <button
          className={`toolbar-button ${sidebarVisible ? "active" : ""}`}
          type="button"
          title="Toggle Commands"
          onClick={onToggleSidebar}
        >
          <Zap size={14} />
        </button>
        <button
          className="toolbar-button"
          type="button"
          title="Settings"
          onClick={onOpenSettings}
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
}
