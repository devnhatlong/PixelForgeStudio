"use client";

import { useEffect } from "react";
import { X, type LucideIcon } from "lucide-react";

export function Modal({
  title,
  subtitle,
  icon: Icon,
  onClose,
  children,
  width = 560,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  /** px number or any CSS width (e.g. "min(1680px, 96vw)") */
  width?: number | string;
  /** extra class on the dialog (e.g. "modal-xl" for near-fullscreen tools) */
  className?: string;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`} style={{ width, maxWidth: "calc(100vw - 32px)" }} role="dialog" aria-modal>
        <div className="modal-head">
          {Icon && <span className="modal-icon"><Icon size={18} /></span>}
          <div className="modal-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
