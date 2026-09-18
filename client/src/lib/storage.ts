import type { PixelDocument, ProjectSummary } from "@/types/editor";
import { makeThumbnail } from "./raster";
import { normalizeDocument } from "./document";

const DB_NAME = "pixelforge";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_DOCS = "documents";

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
    updatedAt: Date.now(),
    deleted: extra?.deleted ?? existing?.deleted ?? false,
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

export async function updateSummary(id: string, patch: Partial<ProjectSummary>): Promise<void> {
  const summary = await getSummary(id);
  if (!summary) return;
  await tx(STORE_PROJECTS, "readwrite", (s) => s.put({ ...summary, ...patch }));
}
