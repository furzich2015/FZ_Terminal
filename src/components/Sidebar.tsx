import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  FolderPlus,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";
import type { QuickCommand } from "../types";
import { useAppStore } from "../store/appStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Modal, PromptModal } from "./Modal";
import { Toggle } from "./Toggle";

interface SidebarProps {
  onRunCommand: (command: QuickCommand) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  onRunCommand,
  onOpenSettings,
}: SidebarProps) {
  const groups = useAppStore((state) => state.commandGroups);
  const toggleGroup = useAppStore((state) => state.toggleCommandGroup);
  const addGroup = useAppStore((state) => state.addCommandGroup);
  const renameGroup = useAppStore((state) => state.renameCommandGroup);
  const removeGroup = useAppStore((state) => state.removeCommandGroup);
  const addCommand = useAppStore((state) => state.addCommand);
  const updateCommand = useAppStore((state) => state.updateCommand);
  const removeCommand = useAppStore((state) => state.removeCommand);

  const [search, setSearch] = useState("");
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [rename, setRename] = useState<{
    groupId: string;
    value: string;
  } | null>(null);
  const [commandModal, setCommandModal] = useState<{
    mode: "add" | "edit";
    groupId: string;
    commandId?: string;
    name: string;
    command: string;
    fastExecution: boolean;
  } | null>(null);
  const [menu, setMenu] = useState<{
    kind: "group" | "command";
    groupId: string;
    command?: QuickCommand;
    x: number;
    y: number;
  } | null>(null);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({
        ...group,
        expanded: true,
        commands: group.commands.filter(
          (command) =>
            command.name.toLowerCase().includes(query) ||
            command.command.toLowerCase().includes(query),
        ),
      }))
      .filter(
        (group) =>
          group.name.toLowerCase().includes(query) ||
          group.commands.length > 0,
      );
  }, [groups, search]);

  const menuItems: ContextMenuItem[] = menu
    ? menu.kind === "command" && menu.command
      ? [
          {
            label:
              (menu.command.fastExecution ?? true)
                ? "Run command"
                : "Insert command",
            icon: Play,
            action: () => onRunCommand(menu.command!),
          },
          {
            label: "Edit command",
            icon: Edit3,
            action: () =>
              setCommandModal({
                mode: "edit",
                groupId: menu.groupId,
                commandId: menu.command!.id,
                name: menu.command!.name,
                command: menu.command!.command,
                fastExecution: menu.command!.fastExecution ?? true,
              }),
          },
          { separator: true },
          {
            label: "Remove command",
            icon: Trash2,
            danger: true,
            action: () => removeCommand(menu.groupId, menu.command!.id),
          },
        ]
      : [
          {
            label: "Add command",
            icon: Plus,
            action: () =>
              setCommandModal({
                mode: "add",
                groupId: menu.groupId,
                name: "",
                command: "",
                fastExecution: true,
              }),
          },
          {
            label: "Rename folder",
            icon: Edit3,
            action: () => {
              const group = groups.find((item) => item.id === menu.groupId);
              if (group) setRename({ groupId: group.id, value: group.name });
            },
          },
          { separator: true },
          {
            label: "Delete folder",
            icon: Trash2,
            danger: true,
            action: () => removeGroup(menu.groupId),
          },
        ]
    : [];

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <span className="eyebrow">Library</span>
            <h2>Quick commands</h2>
          </div>
          <div className="sidebar-header-actions">
            <button
              className="icon-button"
              type="button"
              title="New folder"
              onClick={() => setNewGroup("")}
            >
              <FolderPlus size={15} />
            </button>
          </div>
        </div>

        <label className="sidebar-search">
          <Search size={13} />
          <input
            value={search}
            placeholder="Filter commands"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="command-groups">
          {filteredGroups.map((group) => (
            <section className="command-group" key={group.id}>
              <div
                className="command-group-header"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({
                    kind: "group",
                    groupId: group.id,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <button
                  type="button"
                  className="group-toggle"
                  onClick={() => toggleGroup(group.id)}
                >
                  {group.expanded ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                  <span>{group.name}</span>
                  <small>{group.commands.length}</small>
                </button>
                <button
                  className="group-add"
                  type="button"
                  aria-label={`Add command to ${group.name}`}
                  onClick={() =>
                    setCommandModal({
                      mode: "add",
                      groupId: group.id,
                      name: "",
                      command: "",
                      fastExecution: true,
                    })
                  }
                >
                  <Plus size={12} />
                </button>
              </div>

              {group.expanded && (
                <div className="command-list">
                  {group.commands.map((command) => (
                    <div
                      className="command-item"
                      key={command.id}
                      title={command.command}
                      data-command={command.command}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenu({
                          kind: "command",
                          groupId: group.id,
                          command,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    >
                      <button
                        className="command-run"
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onRunCommand(command)}
                      >
                        <span className="command-icon">
                          <Terminal size={13} />
                        </span>
                        <span className="command-copy">
                          <strong>{command.name}</strong>
                        </span>
                      </button>
                      <button
                        className="command-more"
                        type="button"
                        title={`Edit ${command.name}`}
                        onClick={() =>
                          setCommandModal({
                            mode: "edit",
                            groupId: group.id,
                            commandId: command.id,
                            name: command.name,
                            command: command.command,
                            fastExecution: command.fastExecution ?? true,
                          })
                        }
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      <code className="command-hover">{command.command}</code>
                    </div>
                  ))}
                  {group.commands.length === 0 && (
                    <button
                      className="empty-command"
                      type="button"
                      onClick={() =>
                        setCommandModal({
                          mode: "add",
                          groupId: group.id,
                          name: "",
                          command: "",
                          fastExecution: true,
                        })
                      }
                    >
                      <Plus size={12} /> Add the first command
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            className="sidebar-new-folder"
            type="button"
            onClick={() => setNewGroup("")}
          >
            <Plus size={13} />
            New folder
          </button>
          <button
            className="sidebar-settings"
            type="button"
            title="Settings"
            onClick={onOpenSettings}
          >
            <Settings size={13} />
          </button>
        </div>
      </aside>

      <ContextMenu
        open={Boolean(menu)}
        position={menu ?? { x: 0, y: 0 }}
        items={menuItems}
        onClose={() => setMenu(null)}
      />

      <PromptModal
        open={newGroup !== null}
        title="New command folder"
        label="Folder name"
        value={newGroup ?? ""}
        placeholder="Deployment"
        confirmLabel="Create folder"
        onChange={setNewGroup}
        onConfirm={() => {
          if (newGroup) addGroup(newGroup);
        }}
        onClose={() => setNewGroup(null)}
      />

      <PromptModal
        open={Boolean(rename)}
        title="Rename command folder"
        label="Folder name"
        value={rename?.value ?? ""}
        onChange={(value) =>
          setRename((current) => (current ? { ...current, value } : null))
        }
        onConfirm={() => {
          if (rename) renameGroup(rename.groupId, rename.value);
        }}
        onClose={() => setRename(null)}
      />

      <Modal
        open={Boolean(commandModal)}
        title={
          commandModal?.mode === "edit"
            ? "Edit quick command"
            : "Add quick command"
        }
        subtitle={
          commandModal?.fastExecution
            ? "Fast execution is on: selecting this command runs it immediately."
            : "Insert mode is on: selecting this command only inserts its text."
        }
        onClose={() => setCommandModal(null)}
        footer={
          <>
            <button
              className="button secondary"
              type="button"
              onClick={() => setCommandModal(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              disabled={
                !commandModal?.name.trim() ||
                !commandModal.command.trim()
              }
              onClick={() => {
                if (!commandModal) return;
                const value = {
                  name: commandModal.name.trim(),
                  command: commandModal.command.trim(),
                  fastExecution: commandModal.fastExecution,
                };
                if (
                  commandModal.mode === "edit" &&
                  commandModal.commandId
                ) {
                  updateCommand(
                    commandModal.groupId,
                    commandModal.commandId,
                    value,
                  );
                } else {
                  addCommand(commandModal.groupId, value);
                }
                setCommandModal(null);
              }}
            >
              {commandModal?.mode === "edit" ? "Save changes" : "Add command"}
            </button>
          </>
        }
      >
        {commandModal && (
          <div className="form-stack">
            <label className="field">
              <span>Folder</span>
              <select
                value={commandModal.groupId}
                onChange={(event) =>
                  setCommandModal({
                    ...commandModal,
                    groupId: event.target.value,
                  })
                }
              >
                {groups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Name</span>
              <input
                autoFocus
                value={commandModal.name}
                placeholder="Deploy preview"
                onChange={(event) =>
                  setCommandModal({
                    ...commandModal,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <Toggle
              checked={commandModal.fastExecution}
              onChange={(fastExecution) =>
                setCommandModal({
                  ...commandModal,
                  fastExecution,
                })
              }
              label="Fast execution"
              description="Run immediately when selected. Turn off to only insert the command into the active terminal."
            />
            <label className="field">
              <span>Command</span>
              <input
                value={commandModal.command}
                placeholder="npm run deploy:preview"
                onChange={(event) =>
                  setCommandModal({
                    ...commandModal,
                    command: event.target.value,
                  })
                }
              />
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
