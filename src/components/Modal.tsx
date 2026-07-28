import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({
  open,
  title,
  subtitle,
  width = 520,
  children,
  footer,
  onClose,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(
      new CustomEvent("fz:native-overlay", { detail: 1 }),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.dispatchEvent(
        new CustomEvent("fz:native-overlay", { detail: -1 }),
      );
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>,
    document.getElementById("overlays")!,
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`button ${danger ? "danger" : "primary"}`}
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal-message">{message}</p>
    </Modal>
  );
}

interface PromptModalProps {
  open: boolean;
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  confirmLabel?: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function PromptModal({
  open,
  title,
  label,
  value,
  placeholder,
  confirmLabel = "Save",
  onChange,
  onConfirm,
  onClose,
}: PromptModalProps) {
  const submit = () => {
    if (!value.trim()) return;
    onConfirm();
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!value.trim()}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </label>
    </Modal>
  );
}
