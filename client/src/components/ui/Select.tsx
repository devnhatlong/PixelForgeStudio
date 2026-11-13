"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** secondary line shown in the list (and as tooltip on the trigger) */
  hint?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

/**
 * Themed dropdown replacing the native <select> (whose popup uses the OS light theme on Windows).
 * Keyboard: Enter/Space/↓ opens, ↑/↓ moves, Enter selects, Esc closes, typing a letter jumps.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = "- Chọn -",
  disabled,
  size = "md",
  className = "",
  title,
}: {
  value: T | "" | null | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setDropUp(window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (dir: 1 | -1) => {
    if (!options.length) return;
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const pick = (o: SelectOption<T> | undefined) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't close an enclosing modal
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const i = options.findIndex((o, idx) => idx > active && o.label.toLowerCase().startsWith(k));
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (j >= 0) setActive(j);
    }
  };

  const Icon = current?.icon;
  return (
    <div ref={rootRef} className={`ui-select ${size} ${open ? "open" : ""} ${disabled ? "disabled" : ""} ${className}`}>
      <button
        type="button"
        className="ui-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        title={title ?? (current ? [current.label, current.hint].filter(Boolean).join(" - ") : undefined)}
        onClick={() => setOpen(!open)}
        onKeyDown={onKey}
      >
        {Icon && <Icon size={14} className="ui-select-icon" />}
        <span className={`ui-select-value ${current ? "" : "placeholder"}`}>{current?.label ?? placeholder}</span>
        <ChevronDown size={15} className="ui-select-chevron" />
      </button>
      {open && (
        <ul ref={listRef} id={id} role="listbox" className={`ui-select-list ${dropUp ? "up" : ""}`}>
          {options.length === 0 && <li className="ui-select-empty">Không có lựa chọn</li>}
          {options.map((o, i) => {
            const OIcon = o.icon;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                className={`ui-select-option ${i === active ? "active" : ""} ${o.value === value ? "selected" : ""} ${o.disabled ? "disabled" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
              >
                {OIcon && <OIcon size={14} className="ui-select-icon" />}
                <span className="ui-select-texts">
                  <span className="ui-select-label">{o.label}</span>
                  {o.hint && <span className="ui-select-hint">{o.hint}</span>}
                </span>
                {o.value === value && <Check size={14} className="ui-select-check" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
