import { useEffect, useEffectEvent, useState } from "react";
import {
  ArrowUp,
  Edit3,
  Eye,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  ScanSearch,
  TerminalSquare,
} from "lucide-react";
import type {
  DirectoryEntry,
  DirectoryListing,
  MenuPosition,
} from "../types";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { PromptModal } from "./Modal";

export type FileTerminalAction = "cat" | "nano" | "less" | "grep";

interface FilesPaneProps {
  initialPath: string;
  onPathChange: (path: string) => void;
  onOpenInTerminal: (
    path: string,
    directory: boolean,
    action?: FileTerminalAction,
    pattern?: string,
  ) => void;
}

export function FilesPane({
  initialPath,
  onPathChange,
  onOpenInTerminal,
}: FilesPaneProps) {
  const [listing, setListing] = useState<DirectoryListing>({
    cwd: initialPath,
    entries: [],
  });
  const [pathInput, setPathInput] = useState(initialPath);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<DirectoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{
    entry: DirectoryEntry;
    position: MenuPosition;
  } | null>(null);
  const [grepTarget, setGrepTarget] = useState<DirectoryEntry | null>(null);
  const [grepPattern, setGrepPattern] = useState("");
  const readInitialPath = useEffectEvent(() => initialPath);
  const reportPathChange = useEffectEvent(onPathChange);

  const openDirectory = async (directory?: string) => {
    setLoading(true);
    setError("");
    try {
      const next = await window.fzTerminal.files.listDirectory(directory);
      setListing(next);
      setPathInput(next.cwd);
      setSelected(null);
      onPathChange(next.cwd);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cannot open folder");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    void window.fzTerminal.files
      .listDirectory(readInitialPath())
      .then((next) => {
        if (disposed) return;
        setListing(next);
        setPathInput(next.cwd);
        reportPathChange(next.cwd);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(
            reason instanceof Error ? reason.message : "Cannot open folder",
          );
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const visibleEntries = listing.entries.filter((entry) =>
    entry.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const selectedPath = selected?.path ?? listing.cwd;
  const fileMenuItems: ContextMenuItem[] =
    menu && !menu.entry.directory
      ? [
          {
            label: "Edit with nano",
            icon: Edit3,
            action: () =>
              onOpenInTerminal(
                menu.entry.path ?? menu.entry.name,
                false,
                "nano",
              ),
          },
          {
            label: "Print with cat",
            icon: TerminalSquare,
            action: () =>
              onOpenInTerminal(
                menu.entry.path ?? menu.entry.name,
                false,
                "cat",
              ),
          },
          {
            label: "Page with less",
            icon: Eye,
            action: () =>
              onOpenInTerminal(
                menu.entry.path ?? menu.entry.name,
                false,
                "less",
              ),
          },
          {
            label: "Search with grep…",
            icon: ScanSearch,
            action: () => {
              setGrepTarget(menu.entry);
              setGrepPattern("");
            },
          },
        ]
      : menu
        ? [
            {
              label: "Open folder in terminal",
              icon: TerminalSquare,
              action: () =>
                onOpenInTerminal(
                  menu.entry.path ?? menu.entry.name,
                  true,
                ),
            },
          ]
        : [];

  return (
    <section className="files-pane">
      <header className="files-toolbar">
        <button
          type="button"
          title="Parent folder"
          onClick={() => void openDirectory(`${listing.cwd}/..`)}
        >
          <ArrowUp size={14} />
        </button>
        <form
          className="files-path"
          onSubmit={(event) => {
            event.preventDefault();
            void openDirectory(pathInput);
          }}
        >
          <FolderOpen size={13} />
          <input
            size={Math.min(72, Math.max(12, pathInput.length + 1))}
            value={pathInput}
            spellCheck={false}
            aria-label="Folder path"
            onChange={(event) => setPathInput(event.target.value)}
          />
        </form>
        <label className="files-filter">
          <Search size={12} />
          <input
            size={Math.min(32, Math.max(8, filter.length + 2))}
            value={filter}
            placeholder="Filter"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <button
          type="button"
          title="Refresh"
          onClick={() => void openDirectory(listing.cwd)}
        >
          <RefreshCw className={loading ? "spin" : ""} size={13} />
        </button>
        <button
          className="with-label"
          type="button"
          title={`Open ${selectedPath} in terminal`}
          onClick={() =>
            onOpenInTerminal(
              selectedPath,
              selected?.directory ?? true,
              "cat",
            )
          }
        >
          <TerminalSquare size={13} />
          <span>Open in terminal</span>
        </button>
      </header>

      {error && <div className="files-error">{error}</div>}
      <div className="files-list" role="list">
        {visibleEntries.map((entry) => (
          <button
            className={`file-row ${
              selected?.path === entry.path ? "selected" : ""
            }`}
            type="button"
            role="listitem"
            key={entry.path ?? entry.name}
            title={entry.path}
            onClick={() => setSelected(entry)}
            onContextMenu={(event) => {
              event.preventDefault();
              setSelected(entry);
              setMenu({
                entry,
                position: { x: event.clientX, y: event.clientY },
              });
            }}
            onDoubleClick={() => {
              if (entry.directory) void openDirectory(entry.path);
              else onOpenInTerminal(entry.path ?? entry.name, false, "cat");
            }}
          >
            <span className={`file-icon ${entry.directory ? "folder" : ""}`}>
              {entry.directory ? <Folder size={16} /> : <File size={16} />}
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
        {!loading && visibleEntries.length === 0 && (
          <div className="files-empty">No matching files in this folder.</div>
        )}
      </div>
      <footer className="files-status">
        <span>{visibleEntries.length} items</span>
        <code>{selectedPath}</code>
      </footer>
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
            onOpenInTerminal(
              grepTarget.path ?? grepTarget.name,
              false,
              "grep",
              grepPattern,
            );
          }
        }}
        onClose={() => setGrepTarget(null)}
      />
    </section>
  );
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
