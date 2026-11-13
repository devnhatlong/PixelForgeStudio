"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Download, FolderInput, RefreshCw, Shirt, Wand2, History, Undo2, Film } from "lucide-react";
import { listProjects } from "@/lib/storage";
import { ensureLocalDocument } from "@/lib/sync";
import { downloadBlob } from "@/lib/pforge";
import { exportSpritesZip } from "@/lib/sprite/export-sprite";
import { STATUS_LABEL } from "@/lib/sprite/meta";
import { useProjectActions } from "@/hooks/useProjectActions";
import { useAppStore } from "@/store/app-store";
import { ProjectGridSkeleton, Spinner } from "@/components/ui/Loading";
import { Select } from "@/components/ui/Select";
import { cloneDocument, uid } from "@/lib/document";
import type { PixelDocument, ProjectSummary } from "@/types/editor";
import type { SpriteStatus } from "@/types/sprite";

interface Group {
  characterId: string;
  masters: ProjectSummary[];
  variants: ProjectSummary[];
}

export function SpriteLibrary() {
  const router = useRouter();
  const notify = useAppStore((s) => s.notify);
  const { openById, openDocument } = useProjectActions();
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);

  /** Rollback: copy an older version into a NEW version (latest + 1) — nothing is overwritten. */
  const restore = async (old: ProjectSummary, latestVersion: number) => {
    const d = await ensureLocalDocument(old.id).catch(() => undefined);
    if (!d?.sprite) return notify("Không mở được bản này", "error");
    if (!confirm(`Khôi phục v${d.sprite.version} thành bản mới v${latestVersion + 1}? Các bản hiện có được giữ nguyên.`)) return;
    const now = Date.now();
    const copy = cloneDocument(d);
    copy.id = uid("d");
    copy.createdAt = copy.updatedAt = now;
    copy.name = `${d.name.replace(/ v\d+$/, "")} v${latestVersion + 1}`;
    copy.sprite = {
      ...d.sprite,
      status: "draft",
      approvedHash: null,
      approvedAt: null,
      version: latestVersion + 1,
      previousVersionId: d.id,
      history: [...d.sprite.history, { at: now, action: "rollback", note: `khôi phục từ v${d.sprite.version} (${d.id})` }],
    };
    await openDocument(copy);
    notify(`Đã khôi phục thành v${latestVersion + 1} (Draft) — duyệt lại để dùng`, "success");
  };
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<SpriteStatus | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await listProjects().catch(() => []);
    setItems(all.filter((p) => !p.deleted && p.sprite));
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("pf:pulled", refresh);
    return () => window.removeEventListener("pf:pulled", refresh);
  }, [refresh]);

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const p of items) {
      const s = p.sprite!;
      if (status !== "all" && s.status !== status) continue;
      if (f && !`${p.name} ${s.characterId} ${s.outfit}`.toLowerCase().includes(f)) continue;
      const g = map.get(s.characterId) ?? { characterId: s.characterId, masters: [], variants: [] };
      (s.kind === "master" ? g.masters : g.variants).push(p);
      map.set(s.characterId, g);
    }
    for (const g of map.values()) {
      g.masters.sort((a, b) => b.sprite!.version - a.sprite!.version);
      g.variants.sort((a, b) => a.sprite!.outfit.localeCompare(b.sprite!.outfit) || b.sprite!.version - a.sprite!.version);
    }
    return [...map.values()].sort((a, b) => a.characterId.localeCompare(b.characterId));
  }, [items, filter, status]);

  const exportGroup = async (g: Group, onlyApproved: boolean) => {
    setBusy(g.characterId);
    try {
      const all = [...g.masters, ...g.variants];
      const docs: PixelDocument[] = [];
      for (const p of all) {
        const d = await ensureLocalDocument(p.id);
        if (d) docs.push(d);
      }
      const picked = onlyApproved ? docs.filter((d) => d.sprite?.status === "approved") : docs;
      if (!picked.length) return notify("Chưa có sprite Approved nào trong nhóm này", "error");
      downloadBlob(await exportSpritesZip(picked, { scale: 1 }, docs), `${g.characterId}${onlyApproved ? "_approved" : ""}.zip`);
      notify(`Đã export ${picked.length} sprite`, "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  /** latest version per (kind, outfit) + its older versions */
  const lines = (list: ProjectSummary[]) => {
    const m = new Map<string, ProjectSummary[]>();
    for (const p of list) {
      const key = `${p.sprite!.kind}:${p.sprite!.outfit}`;
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return [...m.values()].map((vs) => {
      const sorted = vs.sort((a, b) => b.sprite!.version - a.sprite!.version || b.updatedAt - a.updatedAt);
      return { latest: sorted[0], older: sorted.slice(1) };
    });
  };

  const Card = ({ p, older = [] }: { p: ProjectSummary; older?: ProjectSummary[] }) => {
    const s = p.sprite!;
    const open = historyOpen === p.id;
    return (
      <div className="project-card sprite-card">
        <div className="project-thumb checker" onClick={() => openById(p.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.thumbnail && <img src={p.thumbnail} alt={p.name} />}
          <span className={`chip tl status-chip ${s.status} ${s.editedAfterApproval ? "stale" : ""}`}>{STATUS_LABEL[s.status]}{s.editedAfterApproval ? " *" : ""}</span>
          <span className="chip br">v{s.version}</span>
        </div>
        <div className="project-meta">
          <div className="project-name">{s.kind === "master" ? <Crown size={12} /> : <Shirt size={12} />} {s.outfit}</div>
          <div className="muted small">{p.width}×{p.height} · {s.presetId}</div>
        </div>
        <div className="project-actions">
          <button className="btn-ghost sm" onClick={() => openById(p.id)}><FolderInput size={13} /> Mở</button>
          {s.kind === "master" && (
            <button className="btn-ghost sm" onClick={() => router.push(`/forge?master=${encodeURIComponent(p.id)}`)}><Shirt size={13} /> Variant</button>
          )}
          {s.kind === "master" && (
            <button className="btn-ghost sm" title="Tạo động tác (Idle, Run, Attack…) từ master này" onClick={() => router.push(`/forge?master=${encodeURIComponent(p.id)}&mode=animation`)}><Film size={13} /> Animation</button>
          )}
          <button className="icon-btn sm" title="Regenerate (giữ bản cũ)" onClick={() => router.push(`/forge?regen=${encodeURIComponent(p.id)}`)}><RefreshCw size={13} /></button>
          {older.length > 0 && (
            <button className={`chip-btn ${open ? "on" : ""}`} onClick={() => setHistoryOpen(open ? null : p.id)} title="Các phiên bản trước"><History size={12} /> {older.length}</button>
          )}
        </div>
        {open && (
          <ul className="version-list">
            {older.map((o) => (
              <li key={o.id}>
                <span className="chip">v{o.sprite!.version}</span>
                <span className={`status-chip chip ${o.sprite!.status}`}>{STATUS_LABEL[o.sprite!.status]}</span>
                <span className="muted small">{new Date(o.updatedAt).toLocaleDateString("vi-VN")}</span>
                <div className="spacer" />
                <button className="link-btn" onClick={() => openById(o.id)}>Mở</button>
                <button className="link-btn" onClick={() => restore(o, s.version)} title="Tạo bản mới từ phiên bản này"><Undo2 size={11} /> Khôi phục</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="home-head">
        <h1>Sprite Library</h1>
        <div className="head-actions">
          <button className="btn-primary sm" onClick={() => router.push("/forge")}><Wand2 size={14} /> Sprite Forge</button>
        </div>
      </div>
      <div className="home-filter">
        <span className="muted">Trạng thái</span>
        <Select<SpriteStatus | "all">
          size="sm"
          className="inline"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "draft", label: "Draft" },
            { value: "reviewed", label: "Reviewed" },
            { value: "approved", label: "Approved" },
          ]}
        />
        <div className="spacer" />
        <span className="muted">Bộ lọc</span>
        <input className="filter-input" placeholder="Nhân vật, outfit…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {loading ? (
        <ProjectGridSkeleton />
      ) : !groups.length ? (
        <div className="empty-cta">
          <Wand2 size={36} className="muted" />
          <strong>Chưa có sprite nào</strong>
          <span className="muted small">Tạo Master đầu tiên trong Sprite Forge (generate bằng AI hoặc nhập ảnh có sẵn).</span>
          <div className="empty-cta-actions">
            <button className="btn-primary" onClick={() => router.push("/forge")}><Wand2 size={15} /> Mở Sprite Forge</button>
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.characterId} className="char-group">
            <div className="char-head">
              <h3>{g.characterId}</h3>
              <span className="muted small">{g.masters.length} master · {g.variants.length} variant</span>
              <div className="spacer" />
              <button className="btn-ghost sm" disabled={busy === g.characterId} onClick={() => exportGroup(g, true)}>
                {busy === g.characterId ? <Spinner size={13} /> : <Download size={13} />} Export Approved
              </button>
              <button className="btn-ghost sm" disabled={busy === g.characterId} onClick={() => exportGroup(g, false)}>Export tất cả</button>
            </div>
            <div className="project-grid">
              {lines(g.masters).map((l) => <Card key={l.latest.id} p={l.latest} older={l.older} />)}
              {lines(g.variants).map((l) => <Card key={l.latest.id} p={l.latest} older={l.older} />)}
            </div>
          </section>
        ))
      )}
    </>
  );
}
