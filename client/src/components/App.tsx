"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { useEditorStore } from "@/store/editor-store";
import { useProjectActions } from "@/hooks/useProjectActions";
import { HomeScreen } from "./home/HomeScreen";
import { EditorShell } from "./editor/EditorShell";
import { NewSpriteModal } from "./home/NewSpriteModal";
import { AuthModal } from "./home/AuthModal";
import { PngToPixelModal } from "./home/PngToPixelModal";
import { ExportModal } from "./editor/ExportModal";
import { CloudModal } from "./cloud/CloudModal";
import { PublishModal } from "./cloud/PublishModal";

export function App() {
  const screen = useAppStore((s) => s.screen);
  const modal = useAppStore((s) => s.modal);
  const closeModal = useAppStore((s) => s.closeModal);
  const toast = useAppStore((s) => s.toast);
  const restore = useAuthStore((s) => s.restore);
  const dirty = useEditorStore((s) => s.dirty);
  const { openDocument, openPforgeFile } = useProjectActions();

  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // global drag & drop of .pforge files
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
      {screen === "home" ? <HomeScreen /> : <EditorShell />}
      {modal === "newSprite" && <NewSpriteModal onClose={closeModal} onCreate={openDocument} />}
      {modal === "auth" && <AuthModal onClose={closeModal} />}
      {modal === "pngToPixel" && <PngToPixelModal onClose={closeModal} onCreate={openDocument} />}
      {modal === "export" && <ExportModal onClose={closeModal} />}
      {modal === "cloud" && <CloudModal onClose={closeModal} />}
      {modal === "publish" && <PublishModal onClose={closeModal} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </>
  );
}
