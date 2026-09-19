"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/store/editor-store";
import { useAppStore } from "@/store/app-store";
import { getSummary, saveProject } from "@/lib/storage";
import { ensureLocalDocument, pushDocument } from "@/lib/sync";
import { parsePforge } from "@/lib/pforge";
import type { PixelDocument } from "@/types/editor";

export const STUDIO_PATH = "/studio";
export const projectPath = (id: string) => `${STUDIO_PATH}/${encodeURIComponent(id)}`;

export function useProjectActions() {
  const router = useRouter();
  const closeModal = useAppStore((s) => s.closeModal);
  const notify = useAppStore((s) => s.notify);
  const setLoading = useAppStore((s) => s.setLoading);
  const activeFolderId = useAppStore((s) => s.activeFolderId);
  const load = useEditorStore((s) => s.loadDocument);

  /** Load a document into the editor, persist it, and navigate to its URL. */
  const openDocument = useCallback(
    async (doc: PixelDocument) => {
      setLoading("Đang mở sprite…");
      try {
        load(doc);
        closeModal();
        const existing = await getSummary(doc.id);
        await saveProject(doc, existing ? undefined : { folderId: activeFolderId });
        pushDocument(doc);
        router.push(projectPath(doc.id));
      } catch {
        notify("Không lưu được vào bộ nhớ trình duyệt", "error");
      } finally {
        setLoading(null);
      }
    },
    [load, closeModal, notify, setLoading, router, activeFolderId],
  );

  /** Navigate to a stored project; the editor route loads it from IndexedDB. */
  const openById = useCallback(
    async (id: string) => {
      setLoading("Đang mở project…");
      try {
        const doc = await ensureLocalDocument(id);
        if (!doc) return notify("Không tìm thấy dữ liệu project", "error");
        load(doc);
        router.push(projectPath(id));
      } catch (e) {
        notify((e as Error).message, "error");
      } finally {
        setLoading(null);
      }
    },
    [load, notify, setLoading, router],
  );

  const openPforgeFile = useCallback(
    async (file: File) => {
      setLoading("Đang đọc file .pforge…");
      try {
        const doc = parsePforge(await file.text(), { newId: false });
        await openDocument(doc);
        notify(`Đã mở "${doc.name}"`, "success");
      } catch (e) {
        notify((e as Error).message, "error");
      } finally {
        setLoading(null);
      }
    },
    [openDocument, notify, setLoading],
  );

  const pickPforge = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pforge,application/json";
    input.onchange = () => input.files?.[0] && openPforgeFile(input.files[0]);
    input.click();
  }, [openPforgeFile]);

  /** Back to the studio; lands inside the folder that contains the given project, if any. */
  const goHome = useCallback(
    async (projectId?: string) => {
      const folderId = projectId ? (await getSummary(projectId).catch(() => undefined))?.folderId : null;
      router.push(folderId ? `${STUDIO_PATH}?folder=${encodeURIComponent(folderId)}` : STUDIO_PATH);
    },
    [router],
  );

  return { openDocument, openById, openPforgeFile, pickPforge, goHome };
}
