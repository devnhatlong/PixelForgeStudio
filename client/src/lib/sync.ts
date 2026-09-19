/**
 * Cloud sync engine.
 *
 * Model: MongoDB is the source of truth once the user is logged in; IndexedDB is a local cache
 * that also lets the app work fully offline / logged out.
 *
 * - pushDocument(doc): debounced upload of a document (called after every local auto-save).
 * - pushMeta(...): folder / trash / rename changes without re-uploading pixels.
 * - pullAll(): merge the cloud project + folder lists into the local cache (last-write-wins on
 *   the document's own updatedAt). Cloud-only projects get a summary with `cloudOnly: true`;
 *   their pixel data is fetched lazily by ensureLocalDocument().
 */
import { api, type CloudProject } from "./api";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";
import { makeThumbnail } from "./raster";
import { normalizeDocument } from "./document";
import {
  getSummary,
  listFolders,
  listProjects,
  loadDocument,
  putFolderRaw,
  putSummaryRaw,
  saveProject,
  deleteFolderLocalOnly,
} from "./storage";
import type { Folder, PixelDocument, ProjectSummary } from "@/types/editor";

const PUSH_DEBOUNCE_MS = 1500;
const RETRY_MS = 15_000;

const isLoggedIn = () => !!useAuthStore.getState().token;
const sync = () => useSyncStore.getState().set;

/* ---------------- push queue ---------------- */

type PendingPush = { doc: PixelDocument; extra?: Partial<ProjectSummary> };
const queue = new Map<string, PendingPush>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function updatePendingCount() {
  const pending = queue.size;
  const s = useSyncStore.getState();
  if (pending > 0 && s.status !== "syncing") sync()({ pending, status: "pending" });
  else sync()({ pending });
}

/** Schedule an upload of the document (debounced, coalesced per id). */
export function pushDocument(doc: PixelDocument, extra?: Partial<ProjectSummary>) {
  if (!isLoggedIn()) return;
  queue.set(doc.id, { doc, extra });
  updatePendingCount();
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, PUSH_DEBOUNCE_MS);
}

/** Upload immediately (used when leaving the editor / before unload). */
export async function flush(): Promise<void> {
  if (flushing || !queue.size) return;
  if (!isLoggedIn()) {
    queue.clear();
    updatePendingCount();
    return;
  }
  flushing = true;
  sync()({ status: "syncing", lastError: null });
  try {
    for (const [id, item] of Array.from(queue.entries())) {
      queue.delete(id);
      const summary = item.extra ?? (await getSummary(id));
      const res = await api.post<CloudProject & { stale?: boolean }>("/projects", {
        clientId: item.doc.id,
        name: item.doc.name,
        width: item.doc.width,
        height: item.doc.height,
        frameCount: item.doc.frames.length,
        thumbnail: makeThumbnail(item.doc, 64),
        data: item.doc,
        docUpdatedAt: item.doc.updatedAt,
        folderId: summary?.folderId ?? null,
        deleted: summary?.deleted ?? false,
        deletedAt: summary?.deletedAt ?? null,
      });
      await putSummaryRaw({ ...(await getSummary(id))!, cloudId: res._id, cloudOnly: false }).catch(() => {});
      if (res.stale) {
        // server had a newer copy: pull it down so the user sees the latest version
        await ensureLocalDocument(id, true).catch(() => {});
      }
    }
    sync()({ status: "synced", lastSyncedAt: Date.now(), pending: queue.size });
  } catch (e) {
    sync()({ status: "error", lastError: (e as Error).message });
    // put nothing back (newer edits will re-queue); retry later for whatever is still queued
    if (queue.size) setTimeout(flush, RETRY_MS);
  } finally {
    flushing = false;
    if (queue.size && !timer) timer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

/** Update folder / trash / name on the server (no pixel data). Silently ignored when logged out. */
export async function pushMeta(clientId: string, patch: { name?: string; folderId?: string | null; deleted?: boolean; deletedAt?: number | null }) {
  if (!isLoggedIn()) return;
  try {
    await api.patch("/projects/meta", { clientId, ...patch });
  } catch (e) {
    // 404 = never uploaded yet: upload the whole document instead
    if ((e as { status?: number }).status === 404) {
      const doc = await loadDocument(clientId);
      if (doc) pushDocument(doc);
      return;
    }
    sync()({ status: "error", lastError: (e as Error).message });
  }
}

export async function deleteRemote(clientId: string) {
  if (!isLoggedIn()) return;
  await api.delete(`/projects/by-client/${encodeURIComponent(clientId)}`).catch(() => {});
}

/* ---------------- folders ---------------- */

export async function pushFolder(folder: Folder) {
  if (!isLoggedIn()) return;
  await api.post("/folders", { clientId: folder.id, name: folder.name, createdAt: folder.createdAt }).catch((e) => sync()({ status: "error", lastError: (e as Error).message }));
}

export async function deleteRemoteFolder(id: string) {
  if (!isLoggedIn()) return;
  await api.delete(`/folders/${encodeURIComponent(id)}`).catch(() => {});
}

/* ---------------- pull / merge ---------------- */

interface CloudFolder {
  clientId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** Merge cloud folders + projects into the local cache. Returns true when something changed. */
export async function pullAll(): Promise<boolean> {
  if (!isLoggedIn()) return false;
  sync()({ status: "syncing", lastError: null });
  try {
    const [cloudProjects, cloudFolders, localProjects, localFolders] = await Promise.all([
      api.get<(CloudProject & { docUpdatedAt?: number; folderId?: string | null; deleted?: boolean; deletedAt?: number | null })[]>("/projects"),
      api.get<CloudFolder[]>("/folders"),
      listProjects(),
      listFolders(),
    ]);
    let changed = false;

    // folders: cloud wins on name when newer; local-only folders are uploaded
    const localFolderMap = new Map(localFolders.map((f) => [f.id, f]));
    const cloudFolderIds = new Set<string>();
    for (const cf of cloudFolders) {
      cloudFolderIds.add(cf.clientId);
      const lf = localFolderMap.get(cf.clientId);
      if (!lf || cf.updatedAt > lf.updatedAt) {
        await putFolderRaw({ id: cf.clientId, name: cf.name, createdAt: cf.createdAt, updatedAt: cf.updatedAt });
        changed = true;
      }
    }
    for (const lf of localFolders) if (!cloudFolderIds.has(lf.id)) await pushFolder(lf);

    // projects
    const localMap = new Map(localProjects.map((p) => [p.id, p]));
    for (const cp of cloudProjects) {
      const lp = localMap.get(cp.clientId);
      const cloudDocTime = cp.docUpdatedAt ?? 0;
      if (!lp) {
        // exists only on cloud → cache the summary, fetch pixels lazily
        await putSummaryRaw({
          id: cp.clientId,
          name: cp.name,
          width: cp.width,
          height: cp.height,
          frameCount: cp.frameCount,
          thumbnail: cp.thumbnail,
          updatedAt: cloudDocTime || cp.updatedAt,
          folderId: cp.folderId ?? null,
          deleted: !!cp.deleted,
          deletedAt: cp.deletedAt ?? undefined,
          cloudId: cp._id,
          cloudOnly: true,
        });
        changed = true;
      } else if (cloudDocTime > lp.updatedAt) {
        // cloud has a newer document → refresh pixels + meta
        await ensureLocalDocument(cp.clientId, true);
        changed = true;
      } else if (lp.updatedAt > cloudDocTime && !lp.cloudOnly) {
        // local is newer (e.g. tab closed before the last push finished) → upload it now
        const doc = await loadDocument(cp.clientId);
        if (doc) queue.set(doc.id, { doc });
      } else {
        // local is same → only mirror meta that may have been changed elsewhere
        const metaChanged = (cp.folderId ?? null) !== (lp.folderId ?? null) || !!cp.deleted !== !!lp.deleted;
        if (metaChanged && cp.updatedAt > lp.updatedAt) {
          await putSummaryRaw({ ...lp, folderId: cp.folderId ?? null, deleted: !!cp.deleted, deletedAt: cp.deletedAt ?? undefined, cloudId: cp._id });
          changed = true;
        } else if (!lp.cloudId) {
          await putSummaryRaw({ ...lp, cloudId: cp._id });
        }
      }
    }
    // local-only projects that were never uploaded (created while offline / before login)
    const cloudIds = new Set(cloudProjects.map((c) => c.clientId));
    for (const lp of localProjects) {
      if (!cloudIds.has(lp.id) && !lp.cloudOnly && !lp.deleted) {
        const doc = await loadDocument(lp.id);
        if (doc) queue.set(doc.id, { doc });
      }
    }
    if (queue.size) {
      updatePendingCount();
      await flush();
    } else {
      sync()({ status: "synced", lastSyncedAt: Date.now() });
    }
    return changed;
  } catch (e) {
    sync()({ status: "error", lastError: (e as Error).message });
    return false;
  }
}

/** Make sure the document's pixels exist locally; downloads from the cloud when needed. */
export async function ensureLocalDocument(id: string, force = false): Promise<PixelDocument | undefined> {
  const local = force ? undefined : await loadDocument(id);
  if (local) return local;
  if (!isLoggedIn()) return undefined;
  const cp = await api.get<CloudProject & { data: PixelDocument; folderId?: string | null; deleted?: boolean; deletedAt?: number | null }>(
    `/projects/by-client/${encodeURIComponent(id)}`,
  );
  const doc = normalizeDocument(cp.data);
  await saveProject(doc, { cloudId: cp._id, cloudOnly: false, folderId: cp.folderId ?? null, deleted: !!cp.deleted, deletedAt: cp.deletedAt ?? undefined });
  return doc;
}

/** Local projects that have never been uploaded (offered for upload on first login). */
export async function listUnsynced(): Promise<ProjectSummary[]> {
  const all = await listProjects();
  return all.filter((p) => !p.cloudId && !p.cloudOnly && !p.deleted);
}

export async function uploadAllLocal(): Promise<number> {
  const items = await listUnsynced();
  const folders = await listFolders();
  for (const f of folders) await pushFolder(f);
  for (const p of items) {
    const doc = await loadDocument(p.id);
    if (doc) queue.set(doc.id, { doc });
  }
  updatePendingCount();
  await flush();
  return items.length;
}

/** Drop the local cache of a folder without touching the cloud (used after a remote delete). */
export { deleteFolderLocalOnly };
