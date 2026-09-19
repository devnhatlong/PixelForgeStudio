"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEditorStore } from "@/store/editor-store";
import { useAuthStore } from "@/store/auth-store";
import { saveProject } from "@/lib/storage";
import { ensureLocalDocument, pushDocument } from "@/lib/sync";
import { STUDIO_PATH } from "@/hooks/useProjectActions";
import { LoadingBlock } from "@/components/ui/Loading";
import { EditorShell } from "./EditorShell";

/** Route component for /studio/[id]: ensures the document with this id is loaded in the editor store. */
export function EditorPage({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const dirty = useEditorStore((s) => s.dirty);
  const load = useEditorStore((s) => s.loadDocument);
  const authReady = useAuthStore((s) => s.ready);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(doc?.id === id ? "ready" : "loading");

  useEffect(() => {
    if (doc?.id === id) {
      setStatus("ready");
      return;
    }
    if (!authReady) return; // wait for session restore so cloud-only projects can be fetched
    let cancelled = false;
    (async () => {
      // leaving another project: persist it before switching
      const current = useEditorStore.getState();
      if (current.doc && current.dirty) {
        await saveProject(current.doc).catch(() => {});
        pushDocument(current.doc);
      }
      const next = await ensureLocalDocument(id).catch(() => undefined);
      if (cancelled) return;
      if (!next) return setStatus("missing");
      load(next);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authReady]);

  // keep the browser tab title in sync
  useEffect(() => {
    if (doc && status === "ready") document.title = `${dirty ? "● " : ""}${doc.name} — PixelForge Studio`;
    return () => {
      document.title = "PixelForge Studio";
    };
  }, [doc, dirty, status]);

  if (status === "loading") return <LoadingBlock label="Đang mở project…" />;
  if (status === "missing")
    return (
      <div className="empty">
        <p>Không tìm thấy project <code>{id}</code> trên trình duyệt này.</p>
        <p className="muted small">Project được lưu cục bộ (IndexedDB). Nếu bạn đã lưu lên Cloud, hãy mở lại từ Cloud Storage.</p>
        <Link href={STUDIO_PATH} className="btn-ghost">← Về Studio</Link>
      </div>
    );
  return <EditorShell />;
}
