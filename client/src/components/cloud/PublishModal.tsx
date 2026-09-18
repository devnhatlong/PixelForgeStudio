"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Loading";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useEditorStore } from "@/store/editor-store";
import { useAppStore } from "@/store/app-store";
import { uploadDocument } from "./CloudModal";

export function PublishModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const doc = useEditorStore((s) => s.doc);
  const notify = useAppStore((s) => s.notify);
  const openModal = useAppStore((s) => s.openModal);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Modal title="Đăng Marketplace" icon={Store} onClose={onClose} width={420}>
        <p className="muted">Bạn cần đăng nhập để đăng sprite lên Marketplace.</p>
        <button className="btn-primary big" onClick={() => openModal("auth")}>Đăng nhập ngay</button>
      </Modal>
    );
  }
  if (!doc) return null;

  const publish = async () => {
    setBusy(true);
    try {
      const cloud = await uploadDocument(doc);
      await api.patch(`/projects/${cloud._id}/publish`, {
        published: true,
        description: description.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      notify("Đã đăng lên Marketplace", "success");
      onClose();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Đăng Marketplace" subtitle="Chia sẻ sprite của bạn với cộng đồng" icon={Store} onClose={onClose} width={480}>
      <div className="cloud-current">
        <div>
          <strong>{doc.name}</strong>
          <div className="muted small">{doc.width}×{doc.height} · {doc.frames.length} frame</div>
        </div>
      </div>
      <label className="field-label">Mô tả</label>
      <textarea className="text-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn về sprite này…" />
      <label className="field-label">Tags (cách nhau bằng dấu phẩy)</label>
      <input className="text-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cat, animal, rpg" />
      <button className="btn-primary big" disabled={busy} aria-busy={busy} onClick={publish}>
        {busy ? <><Spinner size={15} /> Đang đăng…</> : <><Store size={15} /> Đăng lên Marketplace</>}
      </button>
    </Modal>
  );
}
