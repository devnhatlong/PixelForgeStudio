"use client";

import { useState } from "react";
import { Dna, ScanEye, Save } from "lucide-react";
import type { CharacterDna, DnaComparison } from "@/types/sprite";
import { Spinner } from "@/components/ui/Loading";
import { describeImage } from "@/lib/sprite/ai-client";
import { useAppStore } from "@/store/app-store";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Meter({ label, value, display, good, warn, hint }: { label: string; value: number; display: string; good: number; warn: number; hint?: string }) {
  const level = value >= good ? "ok" : value >= warn ? "warn" : "bad";
  return (
    <div className="dna-row" title={hint}>
      <span className="dna-label">{label}</span>
      <div className="dna-bar"><span className={level} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} /></div>
      <span className={`dna-val ${level}`}>{display}</span>
    </div>
  );
}

/** Similarity to the approved master — a warning tool, not a guarantee. */
export function DnaCompareCard({ c }: { c: DnaComparison }) {
  const verdictText = c.verdict === "match" ? "Giống master" : c.verdict === "check" ? "Cần kiểm tra" : "Lệch nhận diện";
  const headColor = Math.max(0, 1 - c.headColorDistance / 80);
  const height = Math.max(0, 1 - Math.abs(c.heightDiffPct) / 20);
  const foot = Math.max(0, 1 - (Math.abs(c.footDelta.dx) + Math.abs(c.footDelta.dy)) / 8);
  return (
    <div className={`dna-card ${c.verdict}`}>
      <div className="dna-head">
        <Dna size={15} />
        <strong>So sánh với Master</strong>
        <span className={`dna-score ${c.verdict}`}>{c.score}/100 · {verdictText}</span>
      </div>
      <Meter label="Vùng đầu (mặt/tóc)" value={c.headIoU} display={pct(c.headIoU)} good={0.85} warn={0.7} hint="Hình dạng phần đầu (1/3 trên) trùng với master" />
      <Meter label="Màu vùng đầu" value={headColor} display={`Δ${Math.round(c.headColorDistance)}`} good={0.75} warn={0.5} hint="Khoảng cách màu trung bình của tóc/da/mắt so với master (nhỏ = giống)" />
      <Meter label="Màu nhận diện giữ lại" value={c.keyColorsKept} display={pct(c.keyColorsKept)} good={0.8} warn={0.6} hint="Các màu đặc trưng (DNA) còn xuất hiện" />
      <Meter label="Silhouette toàn thân" value={c.silhouetteIoU} display={pct(c.silhouetteIoU)} good={0.75} warn={0.55} hint="Trang phục khác sẽ làm số này giảm — bình thường với variant" />
      <Meter label="Chiều cao" value={height} display={`${c.heightDiffPct > 0 ? "+" : ""}${c.heightDiffPct.toFixed(1)}%`} good={0.75} warn={0.5} />
      <Meter label="Vị trí chân" value={foot} display={`${c.footDelta.dx},${c.footDelta.dy}px`} good={0.75} warn={0.5} />
      <p className="muted small">Điểm chỉ là cảnh báo dựa trên pixel — không bảo đảm khuôn mặt giống hệt. Luôn xem bằng mắt ở 1× với overlay.</p>
    </div>
  );
}

/** Edit the master's DNA (traits text is injected into every variant / animation prompt). */
export function DnaEditor({ dna, getImage, onSave }: { dna: CharacterDna | null | undefined; getImage: () => Promise<Blob | null>; onSave: (traits: string, notes: string) => void }) {
  const notify = useAppStore((s) => s.notify);
  const [traits, setTraits] = useState(dna?.traits ?? "");
  const [notes, setNotes] = useState(dna?.notes ?? "");
  const [reading, setReading] = useState(false);
  const dirty = traits !== (dna?.traits ?? "") || notes !== (dna?.notes ?? "");

  const read = async () => {
    setReading(true);
    try {
      const img = await getImage();
      if (!img) return notify("Không có ảnh master để đọc", "error");
      const r = await describeImage(img, "dna");
      setTraits(r.text);
      notify("AI đã đọc DNA — kiểm tra lại rồi bấm Lưu DNA", r.mock ? "info" : "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="dna-editor">
      <div className="dna-head">
        <Dna size={15} />
        <strong>Character DNA</strong>
        <span className="muted small">khóa nhận diện — tự chèn vào prompt của mọi variant / animation</span>
      </div>
      <textarea className="text-input" rows={3} placeholder="vd: young man ~18, oval face, amber eyes, long black hair in a high topknot with side bangs, slim build, head 1/3 of height" value={traits} onChange={(e) => setTraits(e.target.value)} />
      <input className="text-input" placeholder="Ghi chú: phần được phép đổi (trang phục, vũ khí…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {dna && (
        <div className="dna-facts">
          <span className="muted small">Màu nhận diện:</span>
          {dna.keyColors.map((c) => <span key={c} className="swatch" style={{ background: c }} title={c} />)}
          <span className="muted small">· thân {dna.bodyWidth}×{dna.bodyHeight}px</span>
        </div>
      )}
      {!dna && <p className="muted small">Số liệu (màu nhận diện, kích thước) được tạo khi bấm Approved master.</p>}
      <div className="row-actions">
        <button className="btn-ghost sm" disabled={reading} onClick={read}>{reading ? <Spinner size={12} /> : <ScanEye size={13} />} AI đọc DNA từ master</button>
        <button className="btn-primary sm" disabled={!dirty} onClick={() => onSave(traits.trim(), notes.trim())}><Save size={13} /> Lưu DNA</button>
      </div>
    </div>
  );
}
