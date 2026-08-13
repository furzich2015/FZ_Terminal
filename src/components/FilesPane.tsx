import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import {
  ArrowUp,
  ChevronDown,
  Download,
  Edit3,
  Eye,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  TerminalSquare,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  DirectoryEntry,
  DirectoryListing,
  MenuPosition,
  RemoteConnection,
} from "../types";
import { useAppStore } from "../store/appStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { DropdownMenu } from "./DropdownMenu";
import { ConfirmModal, Modal, PromptModal } from "./Modal";

export type FileTerminalAction = "cat" | "nano" | "less" | "grep";

interface FilesPaneProps {
  workspaceId: string;
  initialPath: string;
  initialRemotePath?: string;
  remoteConnectionId?: string;
  onStateChange: (value: {
    filePath?: string;
    remoteFilePath?: string;
    remoteConnectionId?: string;
  }) => void;
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
  onClosePane: () => void;
}

interface ConnectionDraft {
  id?: string;
  name: string;
  host: string;
  user: string;
  port: string;
  rootPath: string;
  identityFile: string;
}

type FileSide = "local" | "remote";

interface FileEditorState {
  side: FileSide;
  entry: DirectoryEntry;
  content: string;
  originalContent: string;
  loading: boolean;
  saving: boolean;
  error: string;
}

interface SudoRequest {
  title: string;
  detail: string;
  run: (password: string) => Promise<void>;
}

const emptyDraft: ConnectionDraft = {
  name: "",
  host: "",
  user: "",
  port: "22",
  rootPath: "~",
  identityFile: "",
};

export function FilesPane({
  workspaceId,
  initialPath,
  initialRemotePath,
  remoteConnectionId,
  onStateChange,
  onOpenInTerminal,
  onOpenRemoteInTerminal,
  onClosePane,
}: FilesPaneProps) {
  const connections = useAppStore((state) => state.connections);
  const workspaces = useAppStore((state) => state.workspaces);
  const saveConnection = useAppStore((state) => state.saveConnection);
  const removeConnection = useAppStore((state) => state.removeConnection);
  const [local, setLocal] = useState<DirectoryListing>({
    cwd: initialPath,
    entries: [],
  });
  const [remote, setRemote] = useState<DirectoryListing>({
    cwd: initialRemotePath ?? "~",
    entries: [],
    remote: true,
  });
  const [localPath, setLocalPath] = useState(initialPath);
  const [remotePath, setRemotePath] = useState(initialRemotePath ?? "~");
  const [localFilter, setLocalFilter] = useState("");
  const [remoteFilter, setRemoteFilter] = useState("");
  const [localSelected, setLocalSelected] = useState<DirectoryEntry | null>(
    null,
  );
  const [remoteSelected, setRemoteSelected] =
    useState<DirectoryEntry | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [remoteError, setRemoteError] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    remoteConnectionId ?? "",
  );
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft | null>(null);
  const [menu, setMenu] = useState<{
    entry: DirectoryEntry;
    side: FileSide;
    position: MenuPosition;
  } | null>(null);
  const [grepTarget, setGrepTarget] = useState<{
    entry: DirectoryEntry;
    remote: boolean;
  } | null>(null);
  const [grepPattern, setGrepPattern] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferNotice, setTransferNotice] = useState("");
  const [createFolderTarget, setCreateFolderTarget] = useState<{
    side: FileSide;
    parent: string;
  } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    side: FileSide;
    entry: DirectoryEntry;
  } | null>(null);
  const [editor, setEditor] = useState<FileEditorState | null>(null);
  const [confirmEditorClose, setConfirmEditorClose] = useState(false);
  const [sudoRequest, setSudoRequest] = useState<SudoRequest | null>(null);
  const readInitialPath = useEffectEvent(() => initialPath);

  const requestSudo = (
    reason: unknown,
    title: string,
    run: (password: string) => Promise<void>,
  ) => {
    if (!isPermissionError(reason)) return false;
    setSudoRequest({
      title,
      detail: formatFileError(
        reason,
        "This operation requires administrator permissions.",
      ),
      run,
    });
    return true;
  };

  const fallbackConnectionId =
    connections.find((item) => item.workspaceIds.includes(workspaceId))?.id ??
    connections[0]?.id ??
    "";
  const storedConnectionId = connections.some(
    (connection) => connection.id === selectedConnectionId,
  )
    ? selectedConnectionId
    : "";
  const effectiveConnectionId =
    storedConnectionId || fallbackConnectionId;

  const selectedConnection = connections.find(
    (connection) => connection.id === effectiveConnectionId,
  );
  const selectedConnectionKey = selectedConnection?.id;
  const orderedConnections = useMemo(
    () =>
      [...connections].sort((left, right) => {
        const leftHere = left.workspaceIds.includes(workspaceId);
        const rightHere = right.workspaceIds.includes(workspaceId);
        return Number(rightHere) - Number(leftHere) ||
          left.name.localeCompare(right.name);
      }),
    [connections, workspaceId],
  );

  const openLocalDirectory = async (
    directory?: string,
    sudoPassword?: string,
  ) => {
    setLocalLoading(true);
    setLocalError("");
    try {
      const next = await window.fzTerminal.files.listDirectory(
        directory,
        sudoPassword,
      );
      setLocal(next);
      setLocalPath(next.cwd);
      setLocalSelected(null);
      onStateChange({ filePath: next.cwd });
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(reason, "Open protected folder with sudo", (password) =>
          openLocalDirectory(directory, password),
        )
      ) {
        return;
      }
      setLocalError(formatFileError(reason, "Cannot open local folder"));
      if (sudoPassword) throw reason;
    } finally {
      setLocalLoading(false);
    }
  };

  const openRemoteDirectory = async (
    connection: RemoteConnection,
    directory?: string,
    force = false,
    sudoPassword?: string,
  ) => {
    setRemoteLoading(true);
    setRemoteError("");
    try {
      const next = await window.fzTerminal.files.listRemoteDirectory(
        connection,
        directory,
        force,
        sudoPassword,
      );
      setRemote(next);
      setRemotePath(next.cwd);
      setRemoteSelected(null);
      onStateChange({
        remoteConnectionId: connection.id,
        remoteFilePath: next.cwd,
      });
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(
          reason,
          "Open protected remote folder with sudo",
          (password) =>
            openRemoteDirectory(connection, directory, true, password),
        )
      ) {
        return;
      }
      setRemoteError(formatFileError(reason, "Cannot open remote folder"));
      if (sudoPassword) throw reason;
    } finally {
      setRemoteLoading(false);
    }
  };

  const openInitialDirectory = useEffectEvent((directory: string) =>
    openLocalDirectory(directory),
  );

  const loadRemoteConnection = useEffectEvent(
    (connectionId: string) => {
      const connection = connections.find((item) => item.id === connectionId);
      if (!connection) return;
      const startingPath =
        connection.id === remoteConnectionId && initialRemotePath
          ? initialRemotePath
          : connection.rootPath;
      void openRemoteDirectory(connection, startingPath);
    },
  );

  useEffect(() => {
    void openInitialDirectory(readInitialPath());
  }, []);

  useEffect(() => {
    if (!selectedConnectionKey) return;
    const timer = window.setTimeout(
      () => loadRemoteConnection(selectedConnectionKey),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [selectedConnectionKey]);

  const localVisible = filterEntries(local.entries, localFilter);
  const remoteVisible = filterEntries(remote.entries, remoteFilter);
  const selectedLocalPath = localSelected?.path ?? local.cwd;
  const selectedRemotePath = remoteSelected?.path ?? remote.cwd;

  const setOperationError = (side: FileSide, reason: unknown, fallback: string) => {
    const message = formatFileError(reason, fallback);
    if (side === "remote") setRemoteError(message);
    else setLocalError(message);
  };

  const refreshSide = async (side: FileSide, sudoPassword?: string) => {
    if (side === "remote") {
      if (selectedConnection) {
        await openRemoteDirectory(
          selectedConnection,
          remote.cwd,
          true,
          sudoPassword,
        );
      }
    } else {
      await openLocalDirectory(local.cwd, sudoPassword);
    }
  };

  const createDirectory = async (
    side: FileSide,
    name: string,
    parentDirectory = side === "remote" ? remote.cwd : local.cwd,
    sudoPassword?: string,
  ) => {
    const trimmedName = name.trim();
    if (!isValidEntryName(trimmedName)) {
      setOperationError(
        side,
        new Error("Folder name cannot contain path separators."),
        "Invalid folder name",
      );
      return;
    }
    const targetPath = joinDisplayPath(parentDirectory, trimmedName);
    try {
      await window.fzTerminal.files.createDirectory({
        path: targetPath,
        ...(side === "remote" && selectedConnection
          ? { connection: selectedConnection }
          : {}),
        ...(sudoPassword ? { sudoPassword } : {}),
      });
      await refreshSide(side, sudoPassword);
      setTransferNotice(`Folder ${trimmedName} created.`);
      window.setTimeout(() => setTransferNotice(""), 3000);
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(reason, `Create “${trimmedName}” with sudo`, (password) =>
          createDirectory(side, trimmedName, parentDirectory, password),
        )
      ) {
        return;
      }
      setOperationError(side, reason, "Cannot create folder");
      if (sudoPassword) throw reason;
    }
  };

  const deleteEntry = async (
    side: FileSide,
    entry: DirectoryEntry,
    sudoPassword?: string,
  ) => {
    try {
      await window.fzTerminal.files.deleteEntry({
        path: entry.path ?? entry.name,
        directory: entry.directory,
        ...(side === "remote" && selectedConnection
          ? { connection: selectedConnection }
          : {}),
        ...(sudoPassword ? { sudoPassword } : {}),
      });
      await refreshSide(side, sudoPassword);
      setTransferNotice(`${entry.name} deleted.`);
      window.setTimeout(() => setTransferNotice(""), 3000);
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(reason, `Delete “${entry.name}” with sudo`, (password) =>
          deleteEntry(side, entry, password),
        )
      ) {
        return;
      }
      setOperationError(side, reason, "Cannot delete file");
      if (sudoPassword) throw reason;
    }
  };

  const moveEntry = async (
    side: FileSide,
    payload: FileDragPayload,
    targetDirectory: string,
    sudoPassword?: string,
  ) => {
    if (
      payload.path === targetDirectory ||
      targetDirectory.startsWith(`${payload.path}/`)
    ) {
      setOperationError(
        side,
        new Error("A folder cannot be moved into itself."),
        "Cannot move file",
      );
      return;
    }
    try {
      await window.fzTerminal.files.moveEntry({
        sourcePath: payload.path,
        targetDirectory,
        ...(side === "remote" && selectedConnection
          ? { connection: selectedConnection }
          : {}),
        ...(sudoPassword ? { sudoPassword } : {}),
      });
      await refreshSide(side, sudoPassword);
      setTransferNotice(
        `${fileNameFromPath(payload.path)} moved to ${targetDirectory}.`,
      );
      window.setTimeout(() => setTransferNotice(""), 3000);
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(
          reason,
          `Move “${fileNameFromPath(payload.path)}” with sudo`,
          (password) => moveEntry(side, payload, targetDirectory, password),
        )
      ) {
        return;
      }
      setOperationError(side, reason, "Cannot move file");
      if (sudoPassword) throw reason;
    }
  };

  const loadEditorFile = async (
    side: FileSide,
    entry: DirectoryEntry,
    sudoPassword?: string,
  ) => {
    const entryPath = entry.path ?? entry.name;
    setEditor((current) =>
      current &&
      current.side === side &&
      (current.entry.path ?? current.entry.name) === entryPath
        ? { ...current, loading: true, error: "" }
        : {
            side,
            entry,
            content: "",
            originalContent: "",
            loading: true,
            saving: false,
            error: "",
          },
    );
    try {
      const result = await window.fzTerminal.files.readFile({
        path: entryPath,
        ...(side === "remote" && selectedConnection
          ? { connection: selectedConnection }
          : {}),
        ...(sudoPassword ? { sudoPassword } : {}),
      });
      setEditor((current) =>
        current &&
        current.side === side &&
        (current.entry.path ?? current.entry.name) === entryPath
          ? {
              ...current,
              content: result.content,
              originalContent: result.content,
              loading: false,
              error: "",
            }
          : current,
      );
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(reason, `Open “${entry.name}” with sudo`, (password) =>
          loadEditorFile(side, entry, password),
        )
      ) {
        setEditor((current) =>
          current ? { ...current, loading: false } : current,
        );
        return;
      }
      const message = formatFileError(reason, "Cannot open file");
      setEditor((current) =>
        current ? { ...current, loading: false, error: message } : current,
      );
      if (sudoPassword) throw reason;
    }
  };

  const saveEditorFile = async (sudoPassword?: string) => {
    if (!editor || editor.loading || editor.saving) return;
    const snapshot = editor;
    const entryPath = snapshot.entry.path ?? snapshot.entry.name;
    setEditor({ ...snapshot, saving: true, error: "" });
    try {
      await window.fzTerminal.files.writeFile({
        path: entryPath,
        content: snapshot.content,
        ...(snapshot.side === "remote" && selectedConnection
          ? { connection: selectedConnection }
          : {}),
        ...(sudoPassword ? { sudoPassword } : {}),
      });
      setEditor((current) =>
        current
          ? {
              ...current,
              originalContent: current.content,
              saving: false,
              error: "",
            }
          : current,
      );
      await refreshSide(snapshot.side, sudoPassword);
    } catch (reason) {
      if (
        !sudoPassword &&
        requestSudo(
          reason,
          `Save “${snapshot.entry.name}” with sudo`,
          (password) => saveEditorFile(password),
        )
      ) {
        setEditor((current) =>
          current ? { ...current, saving: false } : current,
        );
        return;
      }
      const message = formatFileError(reason, "Cannot save file");
      setEditor((current) =>
        current ? { ...current, saving: false, error: message } : current,
      );
      if (sudoPassword) throw reason;
    }
  };

  const openExternalEditor = async (entry: DirectoryEntry) => {
    try {
      await window.fzTerminal.files.openExternal(entry.path ?? entry.name);
    } catch (reason) {
      setOperationError(
        "local",
        reason,
        "Cannot open file in the external editor",
      );
    }
  };

  const transferEntry = async (
    direction: "upload" | "download",
    entry: DirectoryEntry,
    targetDirectory = direction === "upload" ? remote.cwd : local.cwd,
    sudoPassword?: string,
  ) => {
    if (!selectedConnection || transferLoading) return;
    setTransferLoading(true);
    setTransferNotice(
      `${direction === "upload" ? "Uploading" : "Downloading"} ${entry.name}…`,
    );
    try {
      await window.fzTerminal.files.transfer(selectedConnection, {
        direction,
        sourcePath: entry.path ?? entry.name,
        targetDirectory,
        directory: entry.directory,
        ...(sudoPassword ? { sudoPassword } : {}),
      });
      setTransferNotice(
        `${entry.name} ${direction === "upload" ? "uploaded" : "downloaded"}.`,
      );
      if (direction === "upload") {
        await openRemoteDirectory(
          selectedConnection,
          remote.cwd,
          true,
          sudoPassword,
        );
      } else {
        await openLocalDirectory(local.cwd, sudoPassword);
      }
      window.setTimeout(() => setTransferNotice(""), 3000);
    } catch (reason) {
      setTransferNotice("");
      if (
        !sudoPassword &&
        requestSudo(
          reason,
          `${direction === "upload" ? "Upload" : "Download"} “${entry.name}” with sudo`,
          (password) =>
            transferEntry(
              direction,
              entry,
              targetDirectory,
              password,
            ),
        )
      ) {
        return;
      }
      const message = formatFileError(reason, "File transfer failed");
      if (direction === "upload") setRemoteError(message);
      else setLocalError(message);
      if (sudoPassword) throw reason;
    } finally {
      setTransferLoading(false);
    }
  };

  const entryMenuItems: ContextMenuItem[] =
    menu && !menu.entry.directory
      ? [
          {
            label: "Open in built-in editor",
            icon: Edit3,
            action: () => void loadEditorFile(menu.side, menu.entry),
          },
          ...(menu.side === "local"
            ? [
                {
                  label: "Open in external editor",
                  icon: ExternalLink,
                  action: () => void openExternalEditor(menu.entry),
                },
              ]
            : []),
          { separator: true },
          {
            label: "Edit with nano",
            icon: Edit3,
            action: () => {
              if (menu.side === "remote" && selectedConnection) {
                onOpenRemoteInTerminal(
                  selectedConnection,
                  menu.entry.path ?? menu.entry.name,
                  false,
                  "nano",
                );
              } else {
                onOpenInTerminal(
                  menu.entry.path ?? menu.entry.name,
                  false,
                  "nano",
                );
              }
            },
          },
          {
            label: "Print with cat",
            icon: TerminalSquare,
            action: () => {
              if (menu.side === "remote" && selectedConnection) {
                onOpenRemoteInTerminal(
                  selectedConnection,
                  menu.entry.path ?? menu.entry.name,
                  false,
                  "cat",
                );
              } else {
                onOpenInTerminal(
                  menu.entry.path ?? menu.entry.name,
                  false,
                  "cat",
                );
              }
            },
          },
          {
            label: "Page with less",
            icon: Eye,
            action: () => {
              if (menu.side === "remote" && selectedConnection) {
                onOpenRemoteInTerminal(
                  selectedConnection,
                  menu.entry.path ?? menu.entry.name,
                  false,
                  "less",
                );
              } else {
                onOpenInTerminal(
                  menu.entry.path ?? menu.entry.name,
                  false,
                  "less",
                );
              }
            },
          },
          {
            label: "Search with grep…",
            icon: Search,
            action: () => {
              setGrepTarget({
                entry: menu.entry,
                remote: menu.side === "remote",
              });
              setGrepPattern("");
            },
          },
        ]
      : menu
        ? [
            {
              label: "Open folder in terminal",
              icon: TerminalSquare,
              action: () => {
                if (menu.side === "remote" && selectedConnection) {
                  onOpenRemoteInTerminal(
                    selectedConnection,
                    menu.entry.path ?? menu.entry.name,
                    true,
                  );
                } else {
                  onOpenInTerminal(
                    menu.entry.path ?? menu.entry.name,
                    true,
                  );
                }
              },
            },
            {
              label: "Create folder here…",
              icon: FolderPlus,
              action: () => {
                const entryPath = menu.entry.path ?? menu.entry.name;
                setCreateFolderTarget({
                  side: menu.side,
                  parent: entryPath,
                });
                setFolderName("");
              },
            },
          ]
        : [];
  const fileMenuItems: ContextMenuItem[] = [
    ...entryMenuItems,
    ...(menu && selectedConnection
      ? [
          { separator: true } as const,
          menu.side === "local"
            ? {
                label: `Upload to ${selectedConnection.name}`,
                icon: Upload,
                disabled: transferLoading,
                action: () => void transferEntry("upload", menu.entry),
              }
            : {
                label: "Download to local folder",
                icon: Download,
                disabled: transferLoading,
                action: () => void transferEntry("download", menu.entry),
              },
        ]
      : []),
    ...(entryMenuItems.length > 0 || (menu && selectedConnection)
      ? [{ separator: true } as const]
      : []),
    ...(menu
      ? [
          {
            label: `Delete ${menu.entry.directory ? "folder" : "file"}…`,
            icon: Trash2,
            danger: true,
            action: () =>
              setDeleteTarget({ side: menu.side, entry: menu.entry }),
          },
          { separator: true } as const,
        ]
      : []),
    {
      label: "Close pane",
      icon: X,
      danger: true,
      action: onClosePane,
    },
  ];

  const describeConnection = (connection: RemoteConnection) => {
    const workspaceNames = connection.workspaceIds
      .map((id) => workspaces.find((workspace) => workspace.id === id)?.name)
      .filter(Boolean);
    if (workspaceNames.length === 0) return `${connection.name} · saved`;
    const scope = connection.workspaceIds.includes(workspaceId)
      ? "this workspace"
      : workspaceNames.join(", ");
    return `${connection.name} · ${scope}`;
  };

  const editConnection = (connection?: RemoteConnection) => {
    setConnectionDraft(
      connection
        ? {
            id: connection.id,
            name: connection.name,
            host: connection.host,
            user: connection.user ?? "",
            port: String(connection.port),
            rootPath: connection.rootPath,
            identityFile: connection.identityFile ?? "",
          }
        : { ...emptyDraft },
    );
  };

  const commitConnection = () => {
    if (!connectionDraft?.host.trim()) return;
    const id = saveConnection({
      id: connectionDraft.id,
      name: connectionDraft.name,
      host: connectionDraft.host,
      user: connectionDraft.user,
      port: Number(connectionDraft.port) || 22,
      rootPath: connectionDraft.rootPath,
      identityFile: connectionDraft.identityFile,
    });
    setSelectedConnectionId(id);
    onStateChange({ remoteConnectionId: id });
    setConnectionDraft(null);
  };

  return (
    <section className="files-pane dual-files-pane">
      <header className="files-connection-bar">
        <span>
          <Server size={13} />
          Remote
        </span>
        <DropdownMenu
          ariaLabel="Remote SSH server"
          className="files-server-dropdown"
          items={
            orderedConnections.length
              ? orderedConnections.map((connection) => ({
                  label: describeConnection(connection),
                  selected: connection.id === effectiveConnectionId,
                  action: () => {
                    setSelectedConnectionId(connection.id);
                    onStateChange({ remoteConnectionId: connection.id });
                  },
                }))
              : [{ label: "No saved servers", disabled: true }]
          }
        >
          <span className="files-server-value">
            <span>
              {selectedConnection
                ? describeConnection(selectedConnection)
                : "No saved servers"}
            </span>
            <ChevronDown size={12} />
          </span>
        </DropdownMenu>
        <button
          type="button"
          title="Add SSH connection"
          onClick={() => editConnection()}
        >
          <Plus size={13} />
          <span>Add server</span>
        </button>
        <button
          type="button"
          title="Edit selected connection"
          disabled={!selectedConnection}
          onClick={() => editConnection(selectedConnection)}
        >
          <Edit3 size={12} />
        </button>
        <button
          type="button"
          title="Forget selected connection"
          disabled={!selectedConnection}
          onClick={() => {
            if (!selectedConnection) return;
            removeConnection(selectedConnection.id);
            setSelectedConnectionId("");
            setRemote({ cwd: "~", entries: [], remote: true });
          }}
        >
          <Trash2 size={12} />
        </button>
      </header>

      <div className="files-columns">
        <FileColumn
          side="local"
          label="Local system"
          path={localPath}
          listing={local}
          entries={localVisible}
          selected={localSelected}
          filter={localFilter}
          loading={localLoading}
          error={localError}
          onPathChange={setLocalPath}
          onFilterChange={setLocalFilter}
          onSelect={setLocalSelected}
          onOpen={(entry) => {
            if (entry.directory) void openLocalDirectory(entry.path);
            else void loadEditorFile("local", entry);
          }}
          onOpenPath={(path) => void openLocalDirectory(path)}
          onRefresh={() => void openLocalDirectory(local.cwd)}
          onCreateDirectory={() => {
            setCreateFolderTarget({ side: "local", parent: local.cwd });
            setFolderName("");
          }}
          onContextMenu={(entry, position) =>
            setMenu({ entry, side: "local", position })
          }
          onFileDrop={(payload, targetDirectory) => {
            if (payload.side === "local") {
              void moveEntry("local", payload, targetDirectory);
              return;
            }
            void transferEntry(
              "download",
              entryFromDragPayload(payload),
              targetDirectory,
            );
          }}
          footerAction={
            <button
              type="button"
              title={`Open ${selectedLocalPath} in terminal`}
              onClick={() =>
                onOpenInTerminal(
                  selectedLocalPath,
                  localSelected?.directory ?? true,
                  "cat",
                )
              }
            >
              <TerminalSquare size={12} />
              Terminal
            </button>
          }
        />
        <FileColumn
          side="remote"
          label={
            selectedConnection
              ? `${selectedConnection.user ? `${selectedConnection.user}@` : ""}${selectedConnection.host}`
              : "Remote server"
          }
          remote
          disabled={!selectedConnection}
          path={remotePath}
          listing={remote}
          entries={remoteVisible}
          selected={remoteSelected}
          filter={remoteFilter}
          loading={remoteLoading}
          error={remoteError}
          onPathChange={setRemotePath}
          onFilterChange={setRemoteFilter}
          onSelect={setRemoteSelected}
          onOpen={(entry) => {
            if (!selectedConnection) return;
            if (entry.directory) {
              void openRemoteDirectory(selectedConnection, entry.path);
            } else {
              void loadEditorFile("remote", entry);
            }
          }}
          onOpenPath={(path) => {
            if (selectedConnection) {
              void openRemoteDirectory(selectedConnection, path);
            }
          }}
          onRefresh={() => {
            if (selectedConnection) {
              void openRemoteDirectory(selectedConnection, remote.cwd, true);
            }
          }}
          onCreateDirectory={() => {
            setCreateFolderTarget({ side: "remote", parent: remote.cwd });
            setFolderName("");
          }}
          onContextMenu={(entry, position) =>
            setMenu({ entry, side: "remote", position })
          }
          onFileDrop={(payload, targetDirectory) => {
            if (payload.side === "remote") {
              void moveEntry("remote", payload, targetDirectory);
              return;
            }
            void transferEntry(
              "upload",
              entryFromDragPayload(payload),
              targetDirectory,
            );
          }}
          footerAction={
            selectedConnection ? (
              <button
                type="button"
                title={`Open ${selectedRemotePath} on remote server`}
                onClick={() =>
                  onOpenRemoteInTerminal(
                    selectedConnection,
                    selectedRemotePath,
                    remoteSelected?.directory ?? true,
                    "cat",
                  )
                }
              >
                <TerminalSquare size={12} />
                Terminal
              </button>
            ) : null
          }
          emptyMessage={
            selectedConnection
              ? "No files in this remote folder."
              : "Choose a detected server or add one manually."
          }
        />
      </div>
      {transferNotice && (
        <div className="files-transfer-notice" role="status">
          {transferLoading ? <RefreshCw className="spin" size={12} /> : null}
          {transferNotice}
        </div>
      )}

      <ContextMenu
        open={Boolean(menu)}
        position={menu?.position ?? { x: 0, y: 0 }}
        items={fileMenuItems}
        onClose={() => setMenu(null)}
      />
      <PromptModal
        open={Boolean(grepTarget)}
        title="Search file with grep"
        label="Exact text or regular expression"
        value={grepPattern}
        placeholder="TODO|FIXME"
        confirmLabel="Run grep"
        onChange={setGrepPattern}
        onConfirm={() => {
          if (grepTarget && grepPattern.trim()) {
            if (grepTarget.remote && selectedConnection) {
              onOpenRemoteInTerminal(
                selectedConnection,
                grepTarget.entry.path ?? grepTarget.entry.name,
                false,
                "grep",
                grepPattern,
              );
            } else {
              onOpenInTerminal(
                grepTarget.entry.path ?? grepTarget.entry.name,
                false,
                "grep",
                grepPattern,
              );
            }
          }
        }}
        onClose={() => setGrepTarget(null)}
      />
      <PromptModal
        open={Boolean(createFolderTarget)}
        title="Create folder"
        label="Folder name"
        value={folderName}
        placeholder="new-folder"
        confirmLabel="Create"
        onChange={setFolderName}
        onConfirm={() => {
          if (createFolderTarget) {
            void createDirectory(
              createFolderTarget.side,
              folderName,
              createFolderTarget.parent,
            );
          }
        }}
        onClose={() => {
          setCreateFolderTarget(null);
          setFolderName("");
        }}
      />
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.entry.directory ? "folder" : "file"}?`}
        message={
          deleteTarget
            ? `“${deleteTarget.entry.name}” will be permanently deleted${
                deleteTarget.entry.directory
                  ? " together with everything inside it"
                  : ""
              }.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            void deleteEntry(deleteTarget.side, deleteTarget.entry);
          }
          setDeleteTarget(null);
        }}
        onClose={() => setDeleteTarget(null)}
      />
      <FileEditorModal
        editor={editor}
        onChange={(content) =>
          setEditor((current) =>
            current ? { ...current, content, error: "" } : current,
          )
        }
        onSave={() => void saveEditorFile()}
        onOpenExternal={
          editor?.side === "local"
            ? () => void openExternalEditor(editor.entry)
            : undefined
        }
        onClose={() => {
          if (sudoRequest || confirmEditorClose) return;
          if (editor && editor.content !== editor.originalContent) {
            setConfirmEditorClose(true);
          } else {
            setEditor(null);
          }
        }}
      />
      <ConfirmModal
        open={confirmEditorClose}
        title="Discard unsaved changes?"
        message="Changes made in the built-in editor have not been saved."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          setConfirmEditorClose(false);
          setEditor(null);
        }}
        onClose={() => setConfirmEditorClose(false)}
      />
      {sudoRequest && (
        <SudoModal
          request={sudoRequest}
          onClose={() => setSudoRequest(null)}
        />
      )}
      <ConnectionModal
        draft={connectionDraft}
        onChange={setConnectionDraft}
        onSave={commitConnection}
        onClose={() => setConnectionDraft(null)}
      />
    </section>
  );
}

interface FileColumnProps {
  side: "local" | "remote";
  label: string;
  remote?: boolean;
  disabled?: boolean;
  path: string;
  listing: DirectoryListing;
  entries: DirectoryEntry[];
  selected: DirectoryEntry | null;
  filter: string;
  loading: boolean;
  error: string;
  emptyMessage?: string;
  footerAction?: React.ReactNode;
  onPathChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onSelect: (entry: DirectoryEntry) => void;
  onOpen: (entry: DirectoryEntry) => void;
  onOpenPath: (path: string) => void;
  onRefresh: () => void;
  onCreateDirectory: () => void;
  onContextMenu?: (entry: DirectoryEntry, position: MenuPosition) => void;
  onFileDrop?: (payload: FileDragPayload, targetDirectory: string) => void;
}

function FileColumn({
  side,
  label,
  remote = false,
  disabled = false,
  path,
  listing,
  entries,
  selected,
  filter,
  loading,
  error,
  emptyMessage = "No matching files in this folder.",
  footerAction,
  onPathChange,
  onFilterChange,
  onSelect,
  onOpen,
  onOpenPath,
  onRefresh,
  onCreateDirectory,
  onContextMenu,
  onFileDrop,
}: FileColumnProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  return (
    <section
      className={`file-column ${remote ? "remote" : "local"} ${
        dropTarget === listing.cwd ? "drag-target" : ""
      }`}
      onDragEnter={(event) => {
        if (
          !disabled &&
          Array.from(event.dataTransfer.types).includes(FILE_DRAG_MIME)
        ) {
          event.preventDefault();
          setDropTarget(listing.cwd);
        }
      }}
      onDragOver={(event) => {
        if (
          !disabled &&
          Array.from(event.dataTransfer.types).includes(FILE_DRAG_MIME)
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect =
            readFileDragSide(event.dataTransfer) === side ? "move" : "copy";
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDropTarget(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropTarget(null);
        const payload = readFileDragPayload(event.dataTransfer);
        if (!disabled && payload && payload.side !== side) {
          onFileDrop?.(payload, listing.cwd);
        } else if (!disabled && payload) {
          onFileDrop?.(payload, listing.cwd);
        }
      }}
    >
      <header className="file-column-title">
        {remote ? <Server size={12} /> : <FolderOpen size={12} />}
        <strong>{label}</strong>
        <span>{entries.length} items</span>
      </header>
      <div className="files-toolbar">
        <button
          type="button"
          title="Create folder"
          disabled={disabled}
          onClick={onCreateDirectory}
        >
          <FolderPlus size={12} />
        </button>
        <button
          type="button"
          title="Parent folder"
          disabled={disabled}
          onClick={() => onOpenPath(`${listing.cwd}/..`)}
        >
          <ArrowUp size={13} />
        </button>
        <form
          className="files-path"
          onSubmit={(event) => {
            event.preventDefault();
            onOpenPath(path);
          }}
        >
          <FolderOpen size={12} />
          <input
            value={path}
            disabled={disabled}
            spellCheck={false}
            aria-label={`${label} folder path`}
            onChange={(event) => onPathChange(event.target.value)}
          />
        </form>
        <button
          type="button"
          title="Refresh"
          disabled={disabled}
          onClick={onRefresh}
        >
          <RefreshCw className={loading ? "spin" : ""} size={12} />
        </button>
      </div>
      <label className="file-column-filter">
        <Search size={11} />
        <input
          value={filter}
          disabled={disabled}
          placeholder="Filter files"
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </label>
      {error && <div className="files-error">{error}</div>}
      <div className="files-list" role="list">
        {entries.map((entry) => (
          <button
            className={`file-row ${
              selected?.path === entry.path ? "selected" : ""
            } ${
              entry.directory &&
              dropTarget === (entry.path ?? entry.name)
                ? "folder-drop-target"
                : ""
            }`}
            type="button"
            role="listitem"
            key={entry.path ?? entry.name}
            title={entry.path}
            draggable={!disabled}
            onDragStart={(event) => {
              const payload: FileDragPayload = {
                side,
                path: entry.path ?? entry.name,
                directory: entry.directory,
              };
              event.dataTransfer.effectAllowed = "copyMove";
              event.dataTransfer.setData(
                FILE_DRAG_MIME,
                JSON.stringify(payload),
              );
              event.dataTransfer.setData(`${FILE_DRAG_MIME}-${side}`, "1");
              event.dataTransfer.setData("text/plain", payload.path);
            }}
            onDragEnd={() => setDropTarget(null)}
            onDragEnter={(event) => {
              if (
                entry.directory &&
                !disabled &&
                Array.from(event.dataTransfer.types).includes(FILE_DRAG_MIME)
              ) {
                event.preventDefault();
                event.stopPropagation();
                setDropTarget(entry.path ?? entry.name);
              }
            }}
            onDragOver={(event) => {
              if (
                entry.directory &&
                !disabled &&
                Array.from(event.dataTransfer.types).includes(FILE_DRAG_MIME)
              ) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect =
                  readFileDragSide(event.dataTransfer) === side
                    ? "move"
                    : "copy";
              }
            }}
            onDragLeave={(event) => {
              if (
                entry.directory &&
                !event.currentTarget.contains(event.relatedTarget as Node)
              ) {
                event.stopPropagation();
                setDropTarget(null);
              }
            }}
            onDrop={(event) => {
              if (!entry.directory) return;
              event.preventDefault();
              event.stopPropagation();
              setDropTarget(null);
              const payload = readFileDragPayload(event.dataTransfer);
              if (payload) {
                onFileDrop?.(payload, entry.path ?? entry.name);
              }
            }}
            onClick={() => onSelect(entry)}
            onContextMenu={(event) => {
              if (!onContextMenu) return;
              event.preventDefault();
              onSelect(entry);
              onContextMenu(entry, { x: event.clientX, y: event.clientY });
            }}
            onDoubleClick={() => onOpen(entry)}
          >
            <span className={`file-icon ${entry.directory ? "folder" : ""}`}>
              {entry.directory ? <Folder size={15} /> : <File size={15} />}
            </span>
            <strong>{entry.name}</strong>
            <span>{entry.directory ? "Folder" : formatBytes(entry.size)}</span>
            <time>
              {entry.modified
                ? new Date(entry.modified).toLocaleDateString()
                : ""}
            </time>
          </button>
        ))}
        {!loading && entries.length === 0 && (
          <div className="files-empty">{emptyMessage}</div>
        )}
      </div>
      <footer className="files-status">
        <code>{selected?.path ?? listing.cwd}</code>
        {footerAction}
      </footer>
    </section>
  );
}

function FileEditorModal({
  editor,
  onChange,
  onSave,
  onOpenExternal,
  onClose,
}: {
  editor: FileEditorState | null;
  onChange: (content: string) => void;
  onSave: () => void;
  onOpenExternal?: () => void;
  onClose: () => void;
}) {
  if (!editor) return null;
  const dirty = editor.content !== editor.originalContent;
  const lineCount = editor.content ? editor.content.split("\n").length : 1;
  return (
    <Modal
      open
      title={editor.entry.name}
      subtitle={`${editor.side === "remote" ? "Remote" : "Local"} · ${
        editor.entry.path ?? editor.entry.name
      }`}
      width={960}
      onClose={onClose}
      footer={
        <>
          <span className="file-editor-footer-status">
            {lineCount.toLocaleString()} lines ·{" "}
            {editor.content.length.toLocaleString()} characters
            {dirty ? " · Modified" : ""}
          </span>
          {onOpenExternal && (
            <button
              className="button secondary"
              type="button"
              onClick={onOpenExternal}
            >
              <ExternalLink size={13} />
              External editor
            </button>
          )}
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="button primary"
            type="button"
            disabled={editor.loading || editor.saving || !dirty}
            onClick={onSave}
          >
            {editor.saving ? (
              <RefreshCw className="spin" size={13} />
            ) : (
              <Save size={13} />
            )}
            Save
          </button>
        </>
      }
    >
      <div className="file-editor-shell">
        <div className="file-editor-toolbar">
          <span>
            {editor.side === "remote" ? <Server size={12} /> : <File size={12} />}
            UTF-8
          </span>
          <kbd>Ctrl/⌘ + S</kbd>
        </div>
        <div className="file-editor-content">
          {editor.error && (
            <div className="file-editor-error">{editor.error}</div>
          )}
          {editor.loading ? (
            <div className="file-editor-loading">
              <RefreshCw className="spin" size={17} />
              Loading file…
            </div>
          ) : (
            <textarea
              autoFocus
              aria-label={`Edit ${editor.entry.name}`}
              value={editor.content}
              spellCheck={false}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  (event.ctrlKey || event.metaKey) &&
                  event.key.toLowerCase() === "s"
                ) {
                  event.preventDefault();
                  onSave();
                }
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

function SudoModal({
  request,
  onClose,
}: {
  request: SudoRequest;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      await request.run(password);
      setPassword("");
      onClose();
    } catch (reason) {
      setPassword("");
      setError(formatFileError(reason, "sudo operation failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={request.title}
      subtitle="The password is used only for this operation and is never stored."
      width={460}
      onClose={onClose}
      footer={
        <>
          <button
            className="button secondary"
            type="button"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!password || loading}
            onClick={() => void submit()}
          >
            {loading ? (
              <RefreshCw className="spin" size={13} />
            ) : (
              <LockKeyhole size={13} />
            )}
            Authorize
          </button>
        </>
      }
    >
      <div className="sudo-request">
        <p>{request.detail}</p>
        <label className="field">
          <span>sudo password</span>
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
          />
        </label>
        {error && <div className="file-editor-error">{error}</div>}
      </div>
    </Modal>
  );
}

function ConnectionModal({
  draft,
  onChange,
  onSave,
  onClose,
}: {
  draft: ConnectionDraft | null;
  onChange: (value: ConnectionDraft | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  if (!draft) return null;
  const field = (
    key: keyof ConnectionDraft,
    label: string,
    placeholder: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        autoFocus={key === "name"}
        value={draft[key] ?? ""}
        placeholder={placeholder}
        onChange={(event) =>
          onChange({ ...draft, [key]: event.target.value })
        }
      />
    </label>
  );
  return (
    <Modal
      open
      title={draft.id ? "Edit SSH server" : "Add SSH server"}
      subtitle="Authentication uses your SSH config, agent, or key. Passwords are never stored."
      width={520}
      onClose={onClose}
      footer={
        <>
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!draft.host.trim()}
            onClick={onSave}
          >
            Save connection
          </button>
        </>
      }
    >
      <div className="connection-form">
        {field("name", "Display name", "Production")}
        <div className="connection-form-row">
          {field("user", "User", "deploy")}
          {field("host", "Host or SSH alias", "server.example.com")}
          {field("port", "Port", "22")}
        </div>
        {field("rootPath", "Initial remote folder", "~")}
        <label className="field">
          <span>
            <KeyRound size={12} /> Identity file (optional)
          </span>
          <input
            value={draft.identityFile}
            placeholder="/absolute/path/to/private_key"
            onChange={(event) =>
              onChange({ ...draft, identityFile: event.target.value })
            }
          />
        </label>
      </div>
    </Modal>
  );
}

function filterEntries(entries: DirectoryEntry[], filter: string) {
  const query = filter.trim().toLowerCase();
  return query
    ? entries.filter((entry) => entry.name.toLowerCase().includes(query))
    : entries;
}

function joinDisplayPath(parent: string, name: string) {
  if (parent.endsWith("/") || parent.endsWith("\\")) return `${parent}${name}`;
  const separator =
    parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return `${parent}${separator}${name}`;
}

function isValidEntryName(value: string) {
  return Boolean(
    value &&
      value !== "." &&
      value !== ".." &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes("\0"),
  );
}

function fileNameFromPath(value: string) {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

function entryFromDragPayload(payload: FileDragPayload): DirectoryEntry {
  return {
    name: fileNameFromPath(payload.path),
    path: payload.path,
    directory: payload.directory,
  };
}

function isPermissionError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return /FZ_PERMISSION_REQUIRED|EACCES|EPERM|permission denied|operation not permitted|password is required/i.test(
    message,
  );
}

interface FileDragPayload {
  side: "local" | "remote";
  path: string;
  directory: boolean;
}

const FILE_DRAG_MIME = "application/x-fz-terminal-file";

function readFileDragPayload(dataTransfer: DataTransfer) {
  try {
    const raw = dataTransfer.getData(FILE_DRAG_MIME);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FileDragPayload>;
    if (
      (value.side !== "local" && value.side !== "remote") ||
      typeof value.path !== "string"
    ) {
      return null;
    }
    return {
      side: value.side,
      path: value.path,
      directory: Boolean(value.directory),
    } satisfies FileDragPayload;
  } catch {
    return null;
  }
}

function readFileDragSide(dataTransfer: DataTransfer): FileSide | null {
  const types = Array.from(dataTransfer.types);
  if (types.includes(`${FILE_DRAG_MIME}-local`)) return "local";
  if (types.includes(`${FILE_DRAG_MIME}-remote`)) return "remote";
  return null;
}

function formatFileError(reason: unknown, fallback: string) {
  const raw = reason instanceof Error ? reason.message : String(reason || "");
  const message = raw
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/^FZ_[A-Z_]+:\s*/i, "")
    .replace(/^bash:\s*line\s+\d+:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return message || fallback;
}

function formatBytes(value?: number) {
  if (value === undefined) return "File";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
