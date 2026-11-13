import type { Folder, PixelDocument, ProjectSummary } from "@/types/editor";
import { makeThumbnail } from "./raster";
import { normalizeDocument, uid } from "./document";
import { toSpriteSummary } from "./sprite/meta";

const DB_NAME = "pixelforge";
// v3: + "assets" (source / cleaned / mask images of the sprite pipeline). Upgrades only add stores.
const DB_VERSION = 3;
const STORE_PROJECTS = "projects";
const STORE_DOCS = "documents";
const STORE_FOLDERS = "folders";
const STORE_ASSETS = "assets";

interface StoredDoc {
  id: string;
  doc: PixelDocument;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_DOCS)) db.createObjectStore(STORE_DOCS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ---------------- projects ---------------- */

export async function saveProject(doc: PixelDocument, extra?: Partial<ProjectSummary>): Promise<ProjectSummary> {
  const existing = await getSummary(doc.id);
  const summary: ProjectSummary = {
    ...existing,
    ...extra,
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    frameCount: doc.frames.length,
    thumbnail: makeThumbnail(doc),
    // the document's own edit time, so local/cloud comparisons are consistent across devices
    updatedAt: doc.updatedAt || Date.now(),
    deleted: extra?.deleted ?? existing?.deleted ?? false,
    folderId: extra?.folderId !== undefined ? extra.folderId : existing?.folderId ?? null,
    cloudOnly: false,
    sprite: toSpriteSummary(doc),
  };
  await tx(STORE_DOCS, "readwrite", (s) => s.put({ id: doc.id, doc } satisfies StoredDoc));
  await tx(STORE_PROJECTS, "readwrite", (s) => s.put(summary));
  return summary;
}

export async function getSummary(id: string): Promise<ProjectSummary | undefined> {
  return tx<ProjectSummary | undefined>(STORE_PROJECTS, "readonly", (s) => s.get(id));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<ProjectSummary[]>(STORE_PROJECTS, "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadDocument(id: string): Promise<PixelDocument | undefined> {
  const stored = await tx<StoredDoc | undefined>(STORE_DOCS, "readonly", (s) => s.get(id));
  return stored ? normalizeDocument(stored.doc) : undefined;
}

export async function setDeleted(id: string, deleted: boolean): Promise<void> {
  const summary = await getSummary(id);
  if (!summary) return;
  await tx(STORE_PROJECTS, "readwrite", (s) =>
    s.put({ ...summary, deleted, deletedAt: deleted ? Date.now() : undefined }),
  );
}

export async function deleteForever(id: string): Promise<void> {
  await tx(STORE_PROJECTS, "readwrite", (s) => s.delete(id));
  await tx(STORE_DOCS, "readwrite", (s) => s.delete(id));
}

/** low-level: write a summary as-is (used by the sync engine) */
export async function putSummaryRaw(summary: ProjectSummary): Promise<void> {
  await tx(STORE_PROJECTS, "readwrite", (s) => s.put(summary));
}

/** low-level: write a folder as-is (used by the sync engine) */
export async function putFolderRaw(folder: Folder): Promise<void> {
  await tx(STORE_FOLDERS, "readwrite", (s) => s.put(folder));
}

export async function deleteFolderLocalOnly(id: string): Promise<void> {
  await tx(STORE_FOLDERS, "readwrite", (s) => s.delete(id));
}

export async function updateSummary(id: string, patch: Partial<ProjectSummary>): Promise<void> {
  const summary = await getSummary(id);
  if (!summary) return;
  await tx(STORE_PROJECTS, "readwrite", (s) => s.put({ ...summary, ...patch }));
}

export async function moveProject(id: string, folderId: string | null): Promise<void> {
  await updateSummary(id, { folderId });
}

/* ---------------- folders ---------------- */

export async function listFolders(): Promise<Folder[]> {
  const all = await tx<Folder[]>(STORE_FOLDERS, "readonly", (s) => s.getAll());
  return all.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  return tx<Folder | undefined>(STORE_FOLDERS, "readonly", (s) => s.get(id));
}

export async function createFolder(name: string): Promise<Folder> {
  const now = Date.now();
  const folder: Folder = { id: uid("fd"), name: name.trim() || "Thư mục mới", createdAt: now, updatedAt: now };
  await tx(STORE_FOLDERS, "readwrite", (s) => s.put(folder));
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const f = await getFolder(id);
  if (!f) return;
  await tx(STORE_FOLDERS, "readwrite", (s) => s.put({ ...f, name: name.trim() || f.name, updatedAt: Date.now() }));
}

/** Delete a folder; its projects are moved back to the root. */
export async function deleteFolder(id: string): Promise<void> {
  const projects = await listProjects();
  for (const p of projects) if (p.folderId === id) await updateSummary(p.id, { folderId: null });
  await tx(STORE_FOLDERS, "readwrite", (s) => s.delete(id));
}

/* ---------------- binary assets (sprite pipeline) ---------------- */

export type AssetKind = "source" | "cleaned" | "mask" | "reference";

export interface StoredAsset {
  id: string;
  kind: AssetKind;
  mime: string;
  width: number;
  height: number;
  blob: Blob;
  createdAt: number;
  /** uploaded to the server's asset storage */
  remote?: boolean;
}

/** Assets are immutable: a pipeline re-run creates new derived assets, the source is never overwritten. */
export async function putAsset(asset: StoredAsset): Promise<void> {
  await tx(STORE_ASSETS, "readwrite", (s) => s.put(asset));
}

export async function getAssetLocal(id: string): Promise<StoredAsset | undefined> {
  return tx<StoredAsset | undefined>(STORE_ASSETS, "readonly", (s) => s.get(id));
}

export async function markAssetRemote(id: string): Promise<void> {
  const a = await getAssetLocal(id);
  if (a) await putAsset({ ...a, remote: true });
}
