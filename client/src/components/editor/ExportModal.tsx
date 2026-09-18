"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { useEditorStore } from "@/store/editor-store";
import { renderFrameToCanvas } from "@/lib/raster";
import { downloadBlob, safeName } from "@/lib/pforge";
import { computeSheetGrid, exportFramesZip, exportGif, exportPng, exportSpriteSheet, type Background, type SheetLayout } from "@/lib/export";
import { Download, FolderArchive, Film, Image, Info, LayoutGrid, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type Tab = "png" | "zip" | "gif" | "sheet";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "png", label: "Ảnh tĩnh PNG", icon: Image },
  { id: "zip", label: "Từng Frames (ZIP / Game)", icon: FolderArchive },
  { id: "gif", label: "Ảnh động GIF", icon: Film },
  { id: "sheet", label: "Sprite Sheet + JSON", icon: LayoutGrid },
];

function BgPicker({ value, onChange }: { value: Background; onChange: (b: Background) => void }) {
  return (
    <div className="seg wide">
      <button className={value === "transparent" ? "active" : ""} onClick={() => onChange("transparent")}>Trong suốt</button>
      <button className={value === "black" ? "active" : ""} onClick={() => onChange("black")}>Màu đen</button>
      <button className={value === "white" ? "active" : ""} onClick={() => onChange("white")}>Màu trắng</button>
    </div>
  );
}

function ScalePicker({ value, onChange, options }: { value: number; onChange: (n: number) => void; options: number[] }) {
  return (
    <div className="seg wide">
      {options.map((n) => (
        <button key={n} className={value === n ? "active" : ""} onClick={() => onChange(n)}>{n}x</button>
      ))}
    </div>
  );
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const frameIndex = useEditorStore((s) => s.frameIndex);
  const [tab, setTab] = useState<Tab>("png");
  const [busy, setBusy] = useState(false);

  // png
  const [pngFrame, setPngFrame] = useState(frameIndex);
  const [pngScale, setPngScale] = useState(16);
  const [pngBg, setPngBg] = useState<Background>("transparent");
  // zip
  const [zipScale, setZipScale] = useState(1);
  const [zipBg, setZipBg] = useState<Background>("transparent");
  // gif
  const [gifFps, setGifFps] = useState(8);
  const [gifScale, setGifScale] = useState(8);
  const [gifBg, setGifBg] = useState<Background>("transparent");
  // sheet
  const [layout, setLayout] = useState<SheetLayout>("grid");
  const [columns, setColumns] = useState(3);
  const [spacing, setSpacing] = useState(1);
  const [sheetScale, setSheetScale] = useState(4);

  const [preview, setPreview] = useState<string>("");
  const [gifPreviewIndex, setGifPreviewIndex] = useState(0);

  useEffect(() => {
    if (!doc || tab !== "gif") return;
    const t = setInterval(() => setGifPreviewIndex((i) => (i + 1) % doc.frames.length), doc.frames[gifPreviewIndex]?.duration ?? 125);
    return () => clearInterval(t);
  }, [doc, tab, gifPreviewIndex]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      if (tab === "png") setPreview(renderFrameToCanvas(doc, doc.frames[pngFrame], Math.min(pngScale, 8), pngBg).toDataURL());
      else if (tab === "gif") setPreview(renderFrameToCanvas(doc, doc.frames[gifPreviewIndex], 6, gifBg).toDataURL());
      else if (tab === "sheet") {
        const r = await exportSpriteSheet(doc, { layout, columns, spacing, scale: Math.min(sheetScale, 4) });
        if (!cancelled) setPreview(r.canvas.toDataURL());
      } else setPreview("");
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, tab, pngFrame, pngScale, pngBg, gifPreviewIndex, gifBg, layout, columns, spacing, sheetScale]);

  const sheetInfo = useMemo(() => (doc ? computeSheetGrid(doc.frames.length, { layout, columns, spacing, scale: sheetScale }) : { cols: 1, rows: 1 }), [doc, layout, columns, spacing, sheetScale]);

  if (!doc) return null;
  const name = safeName(doc.name);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`Xuất thất bại: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Xuất File" icon={Download} onClose={onClose} width={760}>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="export-body">
        <div className="export-preview checker">
          {tab === "zip" ? (
            <div className="zip-preview">
              <div className="zip-icon"><FolderArchive size={28} /></div>
              <strong>Bộ ảnh PNG tuần tự ({doc.frames.length} frames)</strong>
              <p className="muted small">
                Xuất từng khung hình thành các file <code>frame_001.png</code>, <code>frame_002.png</code>,… kèm file mô tả thông số <code>animation_meta.json</code>.
              </p>
              <span className="chip">Kích thước mỗi ảnh: {doc.width * zipScale} x {doc.height * zipScale} px ({zipScale}x)</span>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview && <img src={preview} alt="preview" className="export-img" />}
              <div className="muted small preview-caption">
                {tab === "png" && `Kích thước xuất: ${doc.width * pngScale} x ${doc.height * pngScale} px (${pngScale}x)`}
                {tab === "gif" && `${doc.frames.length} Khung hình | timing theo từng frame | ${doc.width * gifScale}x${doc.height * gifScale} px`}
                {tab === "sheet" && `Sprite Atlas Tối Ưu Cho Game Engine — ${sheetInfo.cols} cột x ${sheetInfo.rows} hàng`}
              </div>
            </>
          )}
        </div>

        <div className="export-options">
          {tab === "png" && (
            <>
              <label className="field-label">Chọn khung hình:</label>
              <select className="select" value={pngFrame} onChange={(e) => setPngFrame(Number(e.target.value))}>
                {doc.frames.map((f, i) => (
                  <option key={f.id} value={i}>Khung hình #{i + 1} (Frame {i + 1})</option>
                ))}
              </select>
              <label className="field-label">Độ phóng đại: {pngScale}x</label>
              <ScalePicker value={pngScale} onChange={setPngScale} options={[1, 4, 8, 16, 32]} />
              <label className="field-label">Nền ảnh:</label>
              <BgPicker value={pngBg} onChange={setPngBg} />
              <button
                className="btn-primary big"
                disabled={busy}
                onClick={() => run(async () => downloadBlob(await exportPng(doc, pngFrame, pngScale, pngBg), `${name}_frame${pngFrame + 1}_${pngScale}x.png`))}
              >
                <Download size={15} /> Tải Xuống 1 Frame PNG ({pngScale}x)
              </button>
            </>
          )}

          {tab === "zip" && (
            <>
              <div className="note">
                <strong><Info size={13} /> Tương thích với mọi Game Engine</strong>
                <p className="small">Kéo thả trực tiếp thư mục này vào <b>Unity</b> (Sprite Animation), <b>Godot</b> (AnimatedSprite2D), <b>GameMaker</b>, <b>Phaser.js</b> hoặc lập trình Web Canvas.</p>
              </div>
              <label className="field-label">Độ phóng đại: {zipScale}x</label>
              <ScalePicker value={zipScale} onChange={setZipScale} options={[1, 2, 4, 8, 16]} />
              <label className="field-label">Nền từng khung hình:</label>
              <BgPicker value={zipBg} onChange={setZipBg} />
              <button className="btn-primary big" disabled={busy} onClick={() => run(async () => downloadBlob(await exportFramesZip(doc, zipScale, zipBg), `${name}_frames.zip`))}>
                <FolderArchive size={15} /> Tải Toàn Bộ {doc.frames.length} Khung Hình (.ZIP)
              </button>
            </>
          )}

          {tab === "gif" && (
            <>
              <label className="field-label">FPS mặc định khi frame chưa có duration: {gifFps} FPS</label>
              <input type="range" min={1} max={30} value={gifFps} onChange={(e) => setGifFps(Number(e.target.value))} />
              <label className="field-label">Độ phân giải: {gifScale}x</label>
              <ScalePicker value={gifScale} onChange={setGifScale} options={[1, 2, 4, 8, 16]} />
              <label className="field-label">Nền:</label>
              <BgPicker value={gifBg} onChange={setGifBg} />
              <button className="btn-primary big" disabled={busy} onClick={() => run(async () => downloadBlob(await exportGif(doc, gifScale, gifBg, gifFps), `${name}_${gifScale}x.gif`))}>
                <Film size={15} /> Tải Ảnh Động GIF ({gifScale}x)
              </button>
            </>
          )}

          {tab === "sheet" && (
            <>
              <label className="field-label">Cách sắp xếp khung:</label>
              <div className="seg wide">
                <button className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")}>Lưới</button>
                <button className={layout === "horizontal" ? "active" : ""} onClick={() => setLayout("horizontal")}>Dải ngang</button>
                <button className={layout === "vertical" ? "active" : ""} onClick={() => setLayout("vertical")}>Dải dọc</button>
              </div>
              {layout === "grid" && (
                <>
                  <label className="field-label">Số cột: {columns}</label>
                  <input type="range" min={1} max={Math.max(1, doc.frames.length)} value={Math.min(columns, doc.frames.length)} onChange={(e) => setColumns(Number(e.target.value))} />
                </>
              )}
              <div className="two-col">
                <div>
                  <label className="field-label">Khoảng cách:</label>
                  <select className="select" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))}>
                    {[0, 1, 2, 4, 8].map((n) => <option key={n} value={n}>{n} px</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Tỉ lệ:</label>
                  <select className="select" value={sheetScale} onChange={(e) => setSheetScale(Number(e.target.value))}>
                    <option value={1}>1x (Gốc)</option>
                    <option value={2}>2x</option>
                    <option value={4}>4x (Rõ nét)</option>
                    <option value={8}>8x</option>
                  </select>
                </div>
              </div>
              <button
                className="btn-primary big"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await exportSpriteSheet(doc, { layout, columns, spacing, scale: sheetScale });
                    const zip = new JSZip();
                    zip.file(`${name}.png`, r.png);
                    zip.file(`${name}.json`, r.json);
                    downloadBlob(await zip.generateAsync({ type: "blob" }), `${name}_spritesheet.zip`);
                  })
                }
              >
                <Download size={15} /> Tải Sprite Sheet PNG + File JSON
              </button>
              <div className="muted small center">Tương thích Unity, Godot, Phaser, GameMaker & Web Engines</div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
