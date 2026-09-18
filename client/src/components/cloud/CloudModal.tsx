"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudUpload, FolderInput, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { api, type CloudProject } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useEditorStore } from "@/store/editor-store";
import { useAppStore } from "@/store/app-store";
import { normalizeDocument } from "@/lib/document";
import { makeThumbnail } from "@/lib/raster";
import { updateSummary } from "@/lib/storage";
import { useProjectActions } from "@/hooks/useProjectActions";
import type { PixelDocument } from "@/types/editor";

export async function uploadDocument(doc: PixelDocument): Promise<CloudProject> {
  const res = await api.post<CloudProject>("/projects", {
    clientId: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    frameCount: doc.frames.length,
    thumbnail: makeThumbnail(doc, 64),
    data: doc,
  });
  await updateSummary(doc.id, { cloudId: res._id }).catch(() => {});
  return res;
}

export function CloudModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const doc = useEditorStore((s) => s.doc);
  const markSaved = useEditorStore((s) => s.markSaved);
  const notify = useAppStore((s) => s.notify);
  const openModal = useAppStore((s) => s.openModal);
  const { openDocument } = useProjectActions();
  const [items, setItems] = useState<CloudProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.get<CloudProject[]>("/projects"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  if (!user) {
    return (
      <Modal title="Cloud Storage" icon={Cloud} onClose={onClose} width={420}>
        <p className="muted">Bạn cần đăng nhập để lưu project lên máy chủ.</p>
        <button className="btn-primary big" onClick={() => openModal("auth")}>Đăng nhập ngay</button>
      </Modal>
    );
  }

  const upload = async () => {
    if (!doc) return;
    setBusy("upload");
    try {
      await uploadDocument(doc);
      markSaved();
      notify("Đã lưu lên Cloud", "success");
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const open = async (p: CloudProject) => {
    setBusy(p._id);
    try {
      const full = await api.get<CloudProject & { data: PixelDocument }>(`/projects/${p._id}`);
      await openDocument(normalizeDocument(full.data));
      await updateSummary(full.data.id, { cloudId: p._id }).catch(() => {});
      onClose();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: CloudProject) => {
    if (!confirm(`Xóa "${p.name}" khỏi Cloud?`)) return;
    setBusy(p._id);
    try {
      await api.delete(`/projects/${p._id}`);
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Cloud Storage" subtitle={`Tài khoản: ${user.email}`} icon={Cloud} onClose={onClose} width={680}>
      {doc && (
        <div className="cloud-current">
          <div>
            <strong>{doc.name}</strong>
            <div className="muted small">{doc.width}×{doc.height} · {doc.frames.length} frame · {doc.layers.length} layer</div>
          </div>
          <button className="btn-primary" disabled={busy === "upload"} onClick={upload}>
            {busy === "upload" ? "Đang tải lên…" : <><CloudUpload size={15} /> Lưu project hiện tại lên Cloud</>}
          </button>
        </div>
      )}
      <div className="panel-sub">
        <span>Project trên Cloud ({items.length})</span>
        <button className="link-btn" onClick={refresh}><RefreshCw size={12} /> Làm mới</button>
      </div>
      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <div className="muted">Đang tải…</div>
      ) : items.length === 0 ? (
        <div className="muted">Chưa có project nào trên Cloud.</div>
      ) : (
        <div className="cloud-list">
          {items.map((p) => (
            <div key={p._id} className="cloud-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbnail} alt="" className="cloud-thumb checker" />
              <div className="cloud-info">
                <strong>{p.name}</strong>
                <div className="muted small">
                  {p.width}×{p.height} · {p.frameCount} frame · {new Date(p.updatedAt).toLocaleString("vi-VN")}
                  {p.published && <span className="chip warm" style={{ marginLeft: 6 }}>Marketplace</span>}
                </div>
              </div>
              <button className="btn-ghost" disabled={busy === p._id} onClick={() => open(p)}><FolderInput size={13} /> Mở</button>
              <button className="icon-btn danger" disabled={busy === p._id} onClick={() => remove(p)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
