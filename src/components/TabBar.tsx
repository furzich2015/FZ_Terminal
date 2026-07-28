import { useEffect, useState } from "react";
import {
  CopyPlus,
  Edit3,
  Files,
  Globe2,
  MoreHorizontal,
  Plus,
  SplitSquareHorizontal,
  SplitSquareVertical,
  StickyNote,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import type {
  MenuPosition,
  TabKind,
  TerminalTab,
  Workspace,
} from "../types";
import { useAppStore } from "../store/appStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface TabBarProps {
  workspace: Workspace;
  onNewTab: (kind: TabKind) => void;
  onCloseTab: (tab: TerminalTab) => void;
  onDuplicateTab: (tab: TerminalTab) => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
}

export function TabBar({
  workspace,
  onNewTab,
  onCloseTab,
  onDuplicateTab,
  onSplitHorizontal,
  onSplitVertical,
}: TabBarProps) {
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const renameTab = useAppStore((state) => state.renameTab);
  const [rename, setRename] = useState<{
    tabId: string;
    value: string;
  } | null>(null);
  const [menu, setMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const [newTabMenu, setNewTabMenu] = useState<MenuPosition | null>(null);

  useEffect(() => {
    const beginInlineRename = (event: Event) => {
      const tabId = (event as CustomEvent<string>).detail;
      const tab = workspace.tabs.find((item) => item.id === tabId);
      if (tab) setRename({ tabId: tab.id, value: tab.name });
    };
    window.addEventListener("fz:rename-tab", beginInlineRename);
    return () =>
      window.removeEventListener("fz:rename-tab", beginInlineRename);
  }, [workspace.tabs]);

  const commitRename = (tabId: string, value: string) => {
    if (value.trim()) renameTab(workspace.id, tabId, value);
    setRename(null);
  };

  const target = menu
    ? workspace.tabs.find((tab) => tab.id === menu.tabId)
    : undefined;
  const items: ContextMenuItem[] = target
    ? [
        {
          label: "Rename tab",
          icon: Edit3,
          action: () => setRename({ tabId: target.id, value: target.name }),
        },
        {
          label: "Duplicate tab",
          icon: CopyPlus,
          action: () => onDuplicateTab(target),
        },
        { separator: true },
        {
          label: "Split left / right",
          icon: SplitSquareHorizontal,
          disabled: target.kind !== "terminal",
          action: onSplitHorizontal,
        },
        {
          label: "Split top / bottom",
          icon: SplitSquareVertical,
          disabled: target.kind !== "terminal",
          action: onSplitVertical,
        },
        { separator: true },
        {
          label: "Close tab",
          icon: Trash2,
          danger: true,
          action: () => onCloseTab(target),
        },
      ]
    : [];

  const openMenu = (
    event: React.MouseEvent,
    tabId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ tabId, x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div className="tab-bar">
        <div className="tab-list">
          {workspace.tabs.map((tab) => {
            const active = tab.id === workspace.activeTabId;
            const TabIcon = tabIcons[tab.kind];
            return (
              <div
                className={`tab ${active ? "active" : ""}`}
                key={tab.id}
                data-tab-kind={tab.kind}
                onContextMenu={(event) => openMenu(event, tab.id)}
              >
                {rename?.tabId === tab.id ? (
                  <div className="tab-main editing">
                    <TabIcon className="tab-kind-icon" size={12} />
                    <input
                      className="tab-inline-input"
                      autoFocus
                      value={rename.value}
                      aria-label="Tab name"
                      onChange={(event) =>
                        setRename({
                          tabId: tab.id,
                          value: event.target.value,
                        })
                      }
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={(event) =>
                        commitRename(tab.id, event.currentTarget.value)
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
                    className="tab-main"
                    type="button"
                    onClick={() => setActiveTab(workspace.id, tab.id)}
                    onDoubleClick={() =>
                      setRename({ tabId: tab.id, value: tab.name })
                    }
                  >
                    <TabIcon className="tab-kind-icon" size={12} />
                    <span className="tab-name">{tab.name}</span>
                  </button>
                )}
                <button
                  className="tab-close"
                  type="button"
                  aria-label={`Close ${tab.name}`}
                  onClick={() => onCloseTab(tab)}
                >
                  <X size={12} />
                </button>
                <button
                  className="tab-more"
                  type="button"
                  aria-label={`Menu for ${tab.name}`}
                  onClick={(event) => openMenu(event, tab.id)}
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
            );
          })}
          <button
            className="new-tab-button"
            type="button"
            title="New tab"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setNewTabMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="tab-actions">
          <button
            className="toolbar-button with-label"
            type="button"
            disabled={workspace.tabs.find(
              (tab) => tab.id === workspace.activeTabId,
            )?.kind !== "terminal"}
            onClick={onSplitHorizontal}
          >
            <SplitSquareHorizontal size={13} />
            <span>Split</span>
          </button>
          <button
            className="toolbar-button"
            type="button"
            title="Split top / bottom"
            disabled={workspace.tabs.find(
              (tab) => tab.id === workspace.activeTabId,
            )?.kind !== "terminal"}
            onClick={onSplitVertical}
          >
            <SplitSquareVertical size={13} />
          </button>
        </div>
      </div>

      <ContextMenu
        open={Boolean(menu)}
        position={menu ?? { x: 0, y: 0 }}
        items={items}
        onClose={() => setMenu(null)}
      />
      <ContextMenu
        open={Boolean(newTabMenu)}
        position={newTabMenu ?? { x: 0, y: 0 }}
        items={[
          {
            label: "Terminal",
            icon: TerminalSquare,
            action: () => onNewTab("terminal"),
          },
          {
            label: "Browser",
            icon: Globe2,
            action: () => onNewTab("browser"),
          },
          {
            label: "Files",
            icon: Files,
            action: () => onNewTab("files"),
          },
          {
            label: "Note",
            icon: StickyNote,
            action: () => onNewTab("note"),
          },
        ]}
        onClose={() => setNewTabMenu(null)}
      />

    </>
  );
}

const tabIcons = {
  terminal: TerminalSquare,
  browser: Globe2,
  files: Files,
  note: StickyNote,
} satisfies Record<TabKind, typeof TerminalSquare>;
