import { useEffect, useState } from "react";
import {
  Download,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeft,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { UpdateStatus } from "../types";
import appMark from "../../assets/branding/fz-terminal.svg";
import { WorkspaceBar } from "./WorkspaceBar";

interface TitleBarProps {
  sidebarVisible: boolean;
  terminalActive: boolean;
  onToggleSidebar: () => void;
  onNewWorkspace: () => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onOpenSettings: () => void;
  onOpenUpdates: () => void;
  onSearchTerminal: () => void;
  updateStatus: UpdateStatus;
}

export function TitleBar({
  sidebarVisible,
  terminalActive,
  onToggleSidebar,
  onNewWorkspace,
  onCloseWorkspace,
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
            <X size={8} />
          </button>
          <button
            className="traffic-light minimize"
            aria-label="Minimize"
            type="button"
            onClick={window.fzTerminal.window.minimize}
          >
            <Minus size={8} />
          </button>
          <button
            className="traffic-light maximize"
            aria-label={maximized ? "Restore" : "Maximize"}
            type="button"
            onClick={window.fzTerminal.window.toggleMaximize}
          >
            <Maximize2 size={7} />
          </button>
        </div>
        <span className="titlebar-appmark">
          <img src={appMark} alt="" />
          <span>FZ</span>
        </span>
      </div>

      <div className="titlebar-workspaces no-drag">
        <WorkspaceBar
          onNewWorkspace={onNewWorkspace}
          onCloseWorkspace={onCloseWorkspace}
        />
      </div>

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
          className={`toolbar-button with-label ${
            sidebarVisible ? "active" : ""
          }`}
          type="button"
          title="Toggle Commands"
          onClick={onToggleSidebar}
        >
          <PanelLeft size={14} />
          <span>Commands</span>
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
