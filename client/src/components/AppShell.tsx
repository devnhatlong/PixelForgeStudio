"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { useEditorStore } from "@/store/editor-store";
import { useProjectActions } from "@/hooks/useProjectActions";
import { NewSpriteModal } from "./home/NewSpriteModal";
import { AuthModal } from "./home/AuthModal";
import { PngToPixelModal } from "./home/PngToPixelModal";
import { ExportModal } from "./editor/ExportModal";
import { CloudModal } from "./cloud/CloudModal";
import { PublishModal } from "./cloud/PublishModal";
import { LoadingOverlay } from "./ui/Loading";
import { flush, listUnsynced, pullAll, uploadAllLocal } from "@/lib/sync";
import { useSyncStore } from "@/store/sync-store";

/** Global chrome shared by every route: modals, toast, loading overlay, session restore, .pforge drag & drop. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const modal = useAppStore((s) => s.modal);
  const closeModal = useAppStore((s) => s.closeModal);
  const toast = useAppStore((s) => s.toast);
  const loading = useAppStore((s) => s.loading);
  const restore = useAuthStore((s) => s.restore);
  const user = useAuthStore((s) => s.user);
  const notify = useAppStore((s) => s.notify);
  const setSync = useSyncStore((s) => s.set);
  const dirty = useEditorStore((s) => s.dirty);
  const { openDocument, openPforgeFile } = useProjectActions();

  useEffect(() => {
    restore();
  }, [restore]);

  // on login: offer to upload local-only projects, then pull the cloud state
  useEffect(() => {
    if (!user) {
      setSync({ status: "offline", pending: 0, lastError: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const unsynced = await listUnsynced().catch(() => []);
      if (cancelled) return;
      if (unsynced.length > 0 && confirm(`Bạn có ${unsynced.length} project chỉ lưu trên trình duyệt này. Đồng bộ chúng lên tài khoản ${user.email}?`)) {
        const n = await uploadAllLocal().catch(() => 0);
        notify(`Đã đồng bộ ${n} project lên Cloud`, "success");
      }
      await pullAll();
      window.dispatchEvent(new Event("pf:pulled"));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, notify, setSync]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      flush();
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (f && f.name.endsWith(".pforge")) {
        e.preventDefault();
        openPforgeFile(f);
      }
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openPforgeFile]);

  return (
    <>
      {children}
      {modal === "newSprite" && <NewSpriteModal onClose={closeModal} onCreate={openDocument} />}
      {modal === "auth" && <AuthModal onClose={closeModal} />}
      {modal === "pngToPixel" && <PngToPixelModal onClose={closeModal} onCreate={openDocument} />}
      {modal === "export" && <ExportModal onClose={closeModal} />}
      {modal === "cloud" && <CloudModal onClose={closeModal} />}
      {modal === "publish" && <PublishModal onClose={closeModal} />}
      {loading && <LoadingOverlay label={loading} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </>
  );
}
