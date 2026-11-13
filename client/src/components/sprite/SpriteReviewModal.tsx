"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Eye, EyeOff, RefreshCw, Shirt, FileImage, Film } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Loading";
import { useEditorStore } from "@/store/editor-store";
import { useAppStore } from "@/store/app-store";
import { ensureLocalDocument } from "@/lib/sync";
import { downloadBlob } from "@/lib/pforge";
import { flattenFrame, isEditedAfterApproval, spriteAssetId, STATUS_LABEL, STATUS_ORDER, withStatus } from "@/lib/sprite/meta";
import { runQualityChecks } from "@/lib/sprite/quality";
import { exportSpriteFiles, exportSpritesZip } from "@/lib/sprite/export-sprite";
import { canvasToPng, getAssetBlob, ensureAssetsUploaded } from "@/lib/sprite/assets";
import { compareToMaster, deriveDna } from "@/lib/sprite/dna";
import { DnaCompareCard, DnaEditor } from "./Dna";
import type { PixelDocument } from "@/types/editor";
import type { SpriteStatus } from "@/types/sprite";
import { BgPicker, PixelPreview, ZoomPicker, type PreviewBg } from "./Previews";
import { QualityList } from "./QualityList";

export function SpriteReviewModal({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const updateMeta = useEditorStore((s) => s.updateDocumentMeta);
  const notify = useAppStore((s) => s.notify);
  const router = useRouter();
  const [master, setMaster] = useState<PixelDocument | null>(null);
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth >= 1400 ? 3 : 2));
  const [bg, setBg] = useState<PreviewBg>("checker");
  const [overlayOn, setOverlayOn] = useState(true);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const sprite = doc?.sprite;

  useEffect(() => {
    if (!sprite?.masterId) return;
    ensureLocalDocument(sprite.masterId).then((m) => setMaster(m ?? null)).catch(() => setMaster(null));
  }, [sprite?.masterId]);

  useEffect(() => {
    let url: string | null = null;
    getAssetBlob(sprite?.sourceAssetId).then((b) => {
      if (b) setSourceUrl((url = URL.createObjectURL(b)));
    });
    ensureAssetsUploaded([sprite?.sourceAssetId, sprite?.cleanedAssetId, sprite?.maskAssetId]);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sprite?.sourceAssetId, sprite?.cleanedAssetId, sprite?.maskAssetId]);

  const flat = useMemo(() => (doc ? flattenFrame(doc) : null), [doc]);
  const masterFlat = useMemo(() => (master ? flattenFrame(master) : null), [master]);
  const report = useMemo(() => {
    if (!flat || !sprite) return null;
    return runQualityChecks(flat, sprite.preset, {
      master: sprite.kind === "variant" ? masterFlat : null,
      lockedPalette: sprite.kind === "variant" ? master?.sprite?.lockedPalette ?? null : null,
      paletteStrict: sprite.pixel?.paletteMode === "master",
    });
  }, [flat, sprite, masterFlat, master]);
  const dnaCmp = useMemo(
    () => (flat && masterFlat && sprite?.kind === "variant" ? compareToMaster(flat, masterFlat, master?.sprite?.dna) : null),
    [flat, masterFlat, sprite?.kind, master?.sprite?.dna],
  );

  if (!doc || !sprite || !flat) return null;

  /** image used by "AI đọc DNA": the stored source, else the pixels enlarged ×8 on white */
  const dnaImage = async (): Promise<Blob | null> => {
    const src = await getAssetBlob(sprite.sourceAssetId).catch(() => null);
    if (src) return src;
    const k = 8;
    const c = document.createElement("canvas");
    c.width = doc.width * k;
    c.height = doc.height * k;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    flat.pixels.forEach((p, i) => {
      if (!p) return;
      ctx.fillStyle = p;
      ctx.fillRect((i % doc.width) * k, Math.floor(i / doc.width) * k, k, k);
    });
    return canvasToPng(c);
  };
  const edited = isEditedAfterApproval(doc);

  const setStatus = (s: SpriteStatus) => {
    const errors = report?.issues.filter((i) => i.level === "error") ?? [];
    const warns = report?.issues.filter((i) => i.level === "warn") ?? [];
    if (s === "approved" && (errors.length || warns.length)) {
      if (!confirm(`Còn ${errors.length} lỗi và ${warns.length} cảnh báo. Bạn đã xem kỹ ở 1× và vẫn muốn Approve?`)) return;
    }
    if (s === "approved" && sprite.kind === "variant" && master?.sprite?.status !== "approved") {
      if (!confirm("Master của variant này chưa Approved. Vẫn duyệt variant?")) return;
    }
    updateMeta((d) => withStatus(d, s, note.trim() || undefined));
    setNote("");
    notify(`Trạng thái: ${STATUS_LABEL[s]}${s === "approved" && sprite.kind === "master" ? " - palette master đã được khóa cho các variant" : ""}`, "success");
  };

  const exportZip = async () => {
    setBusy(true);
    try {
      const blob = await exportSpritesZip([doc], { scale: 1 }, master ? [doc, master] : [doc]);
      downloadBlob(blob, `${spriteAssetId(doc)}.zip`);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const exportPngOnly = async () => {
    const { id, png, manifest } = await exportSpriteFiles(doc, { scale: 1 }, master);
    downloadBlob(png, `${id}.png`);
    downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), `${id}.json`);
  };

  const g = sprite.generation;
  return (
    <Modal title="Review & Approve sprite" subtitle={`${sprite.kind === "master" ? "Master" : "Variant"} · ${sprite.characterId} · ${sprite.outfit} · v${sprite.version}`} icon={BadgeCheck} onClose={onClose} width="min(1440px, calc(100vw - 32px))" className="modal-review">
      <div className="review-body">
        <div className="review-preview">
          <div className="toolbar-row">
            <ZoomPicker value={zoom} onChange={setZoom} />
            <BgPicker value={bg} onChange={setBg} />
            {masterFlat && (
              <button className={`btn-ghost sm ${overlayOn ? "on" : ""}`} onClick={() => setOverlayOn(!overlayOn)}>
                {overlayOn ? <Eye size={13} /> : <EyeOff size={13} />} Overlay master
              </button>
            )}
          </div>
          <div className="pv-stage">
            <PixelPreview width={doc.width} height={doc.height} pixels={flat.pixels} zoom={zoom} bg={bg} overlay={overlayOn ? masterFlat?.pixels : null} anchor={sprite.footAnchor} />
            {zoom !== 1 && (
              <div className="pv-1x">
                <span className="muted small">1×</span>
                <PixelPreview width={doc.width} height={doc.height} pixels={flat.pixels} zoom={1} bg={bg} />
                {masterFlat && (
                  <>
                    <span className="muted small">master</span>
                    <PixelPreview width={master!.width} height={master!.height} pixels={masterFlat.pixels} zoom={1} bg={bg} />
                  </>
                )}
              </div>
            )}
          </div>
          <p className="muted small">Đường xanh = foot anchor ({sprite.footAnchor.x}, {sprite.footAnchor.y}). Preview không ảnh hưởng file export.</p>
        </div>

        <div className="review-side">
          <h4>Trạng thái</h4>
          <div className="seg wide">
            {STATUS_ORDER.map((s) => (
              <button key={s} className={sprite.status === s ? "active" : ""} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
          {edited && <p className="note warn">Đã sửa pixel sau khi Approved - cần duyệt lại (bấm Approved lần nữa).</p>}
          <input className="text-input" placeholder="Ghi chú duyệt (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} />

          {sprite.kind === "master" && (
            <DnaEditor
              key={sprite.dna?.updatedAt ?? 0}
              dna={sprite.dna}
              getImage={dnaImage}
              onSave={(traits, notes) => {
                updateMeta((d) =>
                  d.sprite
                    ? {
                        ...d,
                        sprite: {
                          ...d.sprite,
                          dna: { ...(d.sprite.dna ?? deriveDna(flattenFrame(d))), traits, notes, updatedAt: Date.now() },
                          history: [...d.sprite.history, { at: Date.now(), action: "dna-updated" }],
                        },
                      }
                    : d,
                );
                notify("Đã lưu Character DNA — variant / animation mới sẽ dùng nó trong prompt", "success");
              }}
            />
          )}
          {dnaCmp && <DnaCompareCard c={dnaCmp} />}

          <h4>Kiểm tra tự động</h4>
          <QualityList issues={report?.issues ?? []} />
          <p className="muted small">{report?.stats.colors} màu · {report?.stats.opaque} px · {report?.stats.components} mảng</p>

          <h4>Nguồn & metadata</h4>
          <div className="meta-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sourceUrl ? <img src={sourceUrl} alt="source" className="source-thumb checker" /> : <span className="muted small">Không có ảnh nguồn trên máy này</span>}
            <dl className="meta-dl small">
              <dt>Preset</dt><dd>{sprite.presetId} v{sprite.presetVersion}</dd>
              <dt>Provider</dt><dd>{g?.provider ?? "nhập ảnh"}{g?.model ? ` · ${g.model}` : ""}</dd>
              <dt>Seed</dt><dd>{g?.seed ?? "-"}</dd>
              <dt>Reference/Mask</dt><dd>{g?.referenceUsed ? "có" : "không"} / {g?.maskUsed ? "có" : "không"}</dd>
              <dt>Prompt</dt><dd className="clamp" title={g?.prompt}>{g?.prompt ?? "-"}</dd>
            </dl>
          </div>
          <details className="small">
            <summary className="muted">Lịch sử ({sprite.history.length})</summary>
            <ul className="history">
              {sprite.history.slice().reverse().map((h, i) => (
                <li key={i}><span className="muted">{new Date(h.at).toLocaleString("vi-VN")}</span> {h.action}{h.note ? ` - ${h.note}` : ""}</li>
              ))}
            </ul>
          </details>

          <h4>Hành động</h4>
          <div className="row-actions wrap">
            <button className="btn-accent" disabled={busy} onClick={exportZip}>{busy ? <Spinner size={14} /> : <Download size={14} />} Export PNG + JSON (.zip)</button>
            <button className="btn-ghost" onClick={exportPngOnly}><FileImage size={14} /> Tải PNG & JSON rời</button>
            {sprite.kind === "master" && (
              <button className="btn-ghost" onClick={() => { onClose(); router.push(`/forge?master=${encodeURIComponent(doc.id)}`); }}><Shirt size={14} /> Tạo variant</button>
            )}
            {sprite.kind === "master" && (
              <button className="btn-ghost" onClick={() => { onClose(); router.push(`/forge?master=${encodeURIComponent(doc.id)}&mode=animation`); }}><Film size={14} /> Tạo animation</button>
            )}
            <button className="btn-ghost" title="Tạo phiên bản mới; bản hiện tại (kể cả đã duyệt) được giữ nguyên" onClick={() => { onClose(); router.push(`/forge?regen=${encodeURIComponent(doc.id)}`); }}><RefreshCw size={14} /> Regenerate (v{sprite.version + 1})</button>
          </div>
          <p className="muted small">Unity: Texture Type = Sprite, Filter Mode = Point, Compression = None, Pivot = Custom theo <code>unityPivot</code> trong JSON.</p>
        </div>
      </div>
    </Modal>
  );
}
