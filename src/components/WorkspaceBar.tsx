import { useCallback, useState } from "react";
import {
  Edit3,
  Layers3,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ConfirmModal } from "./Modal";

interface WorkspaceBarProps {
  onNewWorkspace: () => void;
  onCloseWorkspace: (workspaceId: string) => void;
}

export function WorkspaceBar({
  onNewWorkspace,
  onCloseWorkspace,
}: WorkspaceBarProps) {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore(
    (state) => state.activeWorkspaceId,
  );
  const setActiveWorkspace = useAppStore(
    (state) => state.setActiveWorkspace,
  );
  const renameWorkspace = useAppStore((state) => state.renameWorkspace);

  const [menu, setMenu] = useState<{
    workspaceId: string;
    x: number;
    y: number;
  } | null>(null);
  const [rename, setRename] = useState<{
    workspaceId: string;
    value: string;
  } | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  const openMenu = useCallback(
    (
      event: React.MouseEvent,
      workspaceId: string,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setMenu({ workspaceId, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const target = menu
    ? workspaces.find((workspace) => workspace.id === menu.workspaceId)
    : undefined;
  const commitRename = (workspaceId: string, value: string) => {
    if (value.trim()) renameWorkspace(workspaceId, value);
    setRename(null);
  };
  const menuItems: ContextMenuItem[] = target
    ? [
        {
          label: "Rename workspace",
          icon: Edit3,
          action: () =>
            setRename({ workspaceId: target.id, value: target.name }),
        },
        { separator: true },
        {
          label: "Close workspace",
          icon: Trash2,
          danger: true,
          disabled: workspaces.length === 1,
          action: () => setConfirmClose(target.id),
        },
      ]
    : [];

  return (
    <>
      <div className="workspace-bar">
        <div className="workspace-label">
          <Layers3 size={13} />
          <span>Workspaces</span>
        </div>
        <div className="workspace-list">
          {workspaces.map((workspace) =>
            rename?.workspaceId === workspace.id ? (
              <div
                className={`workspace-pill editing ${
                  workspace.id === activeWorkspaceId ? "active" : ""
                }`}
                key={workspace.id}
              >
                <input
                  className="workspace-inline-input"
                  autoFocus
                  value={rename.value}
                  aria-label="Workspace name"
                  onChange={(event) =>
                    setRename({
                      workspaceId: workspace.id,
                      value: event.target.value,
                    })
                  }
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={(event) =>
                    commitRename(workspace.id, event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRename(null);
                    }
                  }}
                />
              </div>
            ) : (
              <button
                className={`workspace-pill ${
                  workspace.id === activeWorkspaceId ? "active" : ""
                }`}
                type="button"
                key={workspace.id}
                onClick={() => setActiveWorkspace(workspace.id)}
                onDoubleClick={() =>
                  setRename({
                    workspaceId: workspace.id,
                    value: workspace.name,
                  })
                }
                onContextMenu={(event) => openMenu(event, workspace.id)}
              >
                <span>{workspace.name}</span>
                <span
                  className="pill-menu"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => openMenu(event, workspace.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setMenu({
                        workspaceId: workspace.id,
                        x: rect.left,
                        y: rect.bottom + 4,
                      });
                    }
                  }}
                >
                  <MoreHorizontal size={13} />
                </span>
              </button>
            ),
          )}
          <button
            className="add-pill"
            type="button"
            title="New workspace"
            onClick={onNewWorkspace}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="workspace-count">
          {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
        </div>
      </div>

      <ContextMenu
        open={Boolean(menu)}
        position={menu ?? { x: 0, y: 0 }}
        items={menuItems}
        onClose={() => setMenu(null)}
      />

      <ConfirmModal
        open={Boolean(confirmClose)}
        title="Close workspace?"
        message="All tabs and running shell processes in this workspace will be closed."
        confirmLabel="Close workspace"
        danger
        onConfirm={() => {
          if (confirmClose) onCloseWorkspace(confirmClose);
        }}
        onClose={() => setConfirmClose(null)}
      />
    </>
  );
}
