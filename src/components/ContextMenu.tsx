import {
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { MenuPosition } from "../types";

export interface ContextMenuItem {
  label?: string;
  icon?: LucideIcon;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  open: boolean;
  position: MenuPosition;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({
  open,
  position,
  items,
  onClose,
}: ContextMenuProps) {
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(
      new CustomEvent("fz:native-overlay", { detail: 1 }),
    );
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.dispatchEvent(
        new CustomEvent("fz:native-overlay", { detail: -1 }),
      );
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const safeX = Math.min(position.x, window.innerWidth - 250);
  const safeY = Math.min(position.y, window.innerHeight - 360);

  return createPortal(
    <div
      className="context-menu"
      style={{ left: Math.max(8, safeX), top: Math.max(8, safeY) }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div className="menu-separator" key={`separator-${index}`} />
        ) : (
          <div className="menu-entry-wrap" key={`${item.label}-${index}`}>
            <button
              className={`menu-entry ${item.danger ? "danger" : ""}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.action?.();
                if (!item.children) onClose();
              }}
            >
              <span className="menu-entry-main">
                {item.icon && <item.icon size={14} />}
                <span>{item.label}</span>
              </span>
              {item.children ? (
                <ChevronRight size={13} />
              ) : (
                item.shortcut && (
                  <kbd className="menu-shortcut">{item.shortcut}</kbd>
                )
              )}
            </button>
            {item.children && (
              <div className="context-submenu">
                {item.children.map((child, childIndex) => (
                  <button
                    className={`menu-entry ${child.danger ? "danger" : ""}`}
                    type="button"
                    key={`${child.label}-${childIndex}`}
                    disabled={child.disabled}
                    onClick={() => {
                      child.action?.();
                      onClose();
                    }}
                  >
                    <span className="menu-entry-main">
                      {child.icon && <child.icon size={14} />}
                      <span>{child.label}</span>
                    </span>
                    {child.shortcut && (
                      <kbd className="menu-shortcut">{child.shortcut}</kbd>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>,
    document.getElementById("overlays")!,
  );
}
