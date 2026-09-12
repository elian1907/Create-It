import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, LoaderCircle, Inbox, ArrowUpRight } from "lucide-react";
export function Button({
  children,
  primary = false,
  small = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${primary ? "primary" : ""} ${small ? "small" : ""} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      Chargement du studio…
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
export const fmtDate = (s: string) =>
  new Date(s).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function TagInput({
  value,
  onCommit,
}: {
  value: string[];
  onCommit: (tags: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  useEffect(() => setRaw(value.join(", ")), [JSON.stringify(value)]);
  return (
    <input
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        const next = [
          ...new Set(
            raw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ];
        if (JSON.stringify(next) !== JSON.stringify(value)) onCommit(next);
      }}
    />
  );
}
