"use client";

import { Cloud, CloudOff, CloudUpload, CheckCircle2, AlertCircle } from "lucide-react";
import { useSyncStore } from "@/store/sync-store";
import { useAuthStore } from "@/store/auth-store";
import { Spinner } from "./Loading";
import { flush } from "@/lib/sync";

/** Small cloud status pill: offline / pending / syncing / synced / error. */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pending);
  const lastError = useSyncStore((s) => s.lastError);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  if (!user) {
    return (
      <span className="sync-badge offline" title="Chưa đăng nhập — project chỉ lưu trên trình duyệt này">
        <CloudOff size={13} /> {!compact && "Chỉ lưu cục bộ"}
      </span>
    );
  }
  if (status === "syncing")
    return <span className="sync-badge syncing" title="Đang đồng bộ lên Cloud…"><Spinner size={13} /> {!compact && "Đang đồng bộ"}</span>;
  if (status === "pending")
    return (
      <button className="sync-badge pending" title={`${pending} thay đổi chờ đồng bộ — bấm để đồng bộ ngay`} onClick={() => flush()}>
        <CloudUpload size={13} /> {!compact && `Chờ đồng bộ (${pending})`}
      </button>
    );
  if (status === "error")
    return (
      <button className="sync-badge error" title={`Lỗi đồng bộ: ${lastError ?? ""} — bấm để thử lại`} onClick={() => flush()}>
        <AlertCircle size={13} /> {!compact && "Lỗi đồng bộ"}
      </button>
    );
  if (status === "synced")
    return (
      <span className="sync-badge synced" title={lastSyncedAt ? `Đã đồng bộ lúc ${new Date(lastSyncedAt).toLocaleTimeString("vi-VN")}` : "Đã đồng bộ"}>
        <CheckCircle2 size={13} /> {!compact && "Đã đồng bộ Cloud"}
      </span>
    );
  return <span className="sync-badge idle" title="Đã đăng nhập — thay đổi sẽ tự lưu lên Cloud"><Cloud size={13} /> {!compact && "Cloud"}</span>;
}
