"use client";

import { useCallback } from "react";
import { useEditorStore } from "@/store/editor-store";
import { useAppStore } from "@/store/app-store";
import { loadDocument, saveProject } from "@/lib/storage";
import { parsePforge } from "@/lib/pforge";
import type { PixelDocument } from "@/types/editor";

export function useProjectActions() {
  const setScreen = useAppStore((s) => s.setScreen);
  const closeModal = useAppStore((s) => s.closeModal);
  const notify = useAppStore((s) => s.notify);
  const load = useEditorStore((s) => s.loadDocument);

  const openDocument = useCallback(
    async (doc: PixelDocument) => {
      load(doc);
      closeModal();
      setScreen("editor");
      try {
        await saveProject(doc);
      } catch {
        notify("Không lưu được vào bộ nhớ trình duyệt", "error");
      }
    },
    [load, closeModal, setScreen, notify],
  );

  const openById = useCallback(
    async (id: string) => {
      const doc = await loadDocument(id);
      if (!doc) return notify("Không tìm thấy dữ liệu project", "error");
      load(doc);
      setScreen("editor");
    },
    [load, setScreen, notify],
  );

  const openPforgeFile = useCallback(
    async (file: File) => {
      try {
        const doc = parsePforge(await file.text(), { newId: false });
        await openDocument(doc);
        notify(`Đã mở "${doc.name}"`, "success");
      } catch (e) {
        notify((e as Error).message, "error");
      }
    },
    [openDocument, notify],
  );

  const pickPforge = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pforge,application/json";
    input.onchange = () => input.files?.[0] && openPforgeFile(input.files[0]);
    input.click();
  }, [openPforgeFile]);

  return { openDocument, openById, openPforgeFile, pickPforge };
}
