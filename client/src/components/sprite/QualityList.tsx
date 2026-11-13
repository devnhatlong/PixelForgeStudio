"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { QualityIssue } from "@/types/sprite";

export function QualityList({ issues, extraWarnings = [] }: { issues: QualityIssue[]; extraWarnings?: string[] }) {
  const all: QualityIssue[] = [...extraWarnings.map((m, i) => ({ id: `w${i}`, level: "warn" as const, message: m })), ...issues];
  if (!all.length)
    return (
      <div className="q-item ok">
        <CheckCircle2 size={14} /> Không phát hiện vấn đề tự động. Vẫn cần duyệt bằng mắt ở 1×.
      </div>
    );
  return (
    <ul className="q-list">
      {all.map((i) => (
        <li key={i.id} className={`q-item ${i.level}`}>
          {i.level === "error" ? <XCircle size={14} /> : i.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
