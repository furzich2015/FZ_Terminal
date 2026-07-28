import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface DropdownItem {
  label?: string;
  icon?: LucideIcon;
  shortcut?: string;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

interface DropdownMenuProps {
  label?: string;
  icon?: LucideIcon;
  items: DropdownItem[];
  children?: ReactNode;
  align?: "left" | "right";
  compact?: boolean;
  className?: string;
}

export function DropdownMenu({
  label,
  icon: Icon,
  items,
  children,
  align = "left",
  compact = false,
  className = "",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`dropdown ${className}`} ref={rootRef}>
      <button
        className={`dropdown-trigger ${compact ? "compact" : ""} ${
          open ? "active" : ""
        }`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {children ?? (
          <>
            {Icon && <Icon size={14} />}
            {label && <span>{label}</span>}
            {!compact && <ChevronDown size={12} />}
          </>
        )}
      </button>
      {open && (
        <div className={`dropdown-panel ${align}`}>
          {items.map((item, index) =>
            item.separator ? (
              <div className="menu-separator" key={`separator-${index}`} />
            ) : (
              <button
                className={`menu-entry ${item.danger ? "danger" : ""}`}
                type="button"
                disabled={item.disabled}
                key={`${item.label}-${index}`}
                onClick={() => {
                  item.action?.();
                  setOpen(false);
                }}
              >
                <span className="menu-entry-main">
                  <span className="menu-check">
                    {item.selected && <Check size={12} />}
                  </span>
                  {item.icon && <item.icon size={14} />}
                  <span>{item.label}</span>
                </span>
                {item.shortcut && (
                  <kbd className="menu-shortcut">{item.shortcut}</kbd>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
