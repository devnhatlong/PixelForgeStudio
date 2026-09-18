"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User, FilePlus2, FolderOpen, ImageDown, Home, Store, Trash2, LayoutGrid, List, ArrowDown, ArrowUp,
  RefreshCw, RotateCcw, X, FolderInput, type LucideIcon,
} from "lucide-react";
import { useAppStore, type HomeView } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { deleteForever, listProjects, setDeleted } from "@/lib/storage";
import { api, type CloudProject } from "@/lib/api";
import { normalizeDocument, uid } from "@/lib/document";
import { useProjectActions } from "@/hooks/useProjectActions";
import type { PixelDocument, ProjectSummary } from "@/types/editor";

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 30) return "Just now";
  if (s < 60) return `${s} giây trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(ts).toLocaleDateString("vi-VN");
}

type SortKey = "recent" | "name" | "size" | "frames";

export function HomeScreen() {
  const homeView = useAppStore((s) => s.homeView);
  const setHomeView = useAppStore((s) => s.setHomeView);
  const openModal = useAppStore((s) => s.openModal);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { pickPforge } = useProjectActions();

  const NavItem = ({ view, icon: Icon, label }: { view: HomeView; icon: LucideIcon; label: string }) => (
    <button className={`nav-item ${homeView === view ? "active" : ""}`} onClick={() => setHomeView(view)}>
      <span className="nav-icon"><Icon size={16} /></span>
      <span className="nav-label">{label}</span>
    </button>
  );

  return (
    <div className="home">
      <aside className="home-sidebar">
        <div className="user-card">
          <div className="avatar">{user ? user.name.slice(0, 1).toUpperCase() : <User size={16} />}</div>
          <div className="user-name">{user ? user.name : "Chưa đăng nhập"}</div>
          {user ? (
            <button className="btn-ghost full" onClick={logout}>Đăng xuất</button>
          ) : (
            <button className="btn-primary full" onClick={() => openModal("auth")}>Đăng Nhập</button>
          )}
        </div>
        <div className="nav-group">
          <button className="nav-item" onClick={() => openModal("newSprite")}><span className="nav-icon"><FilePlus2 size={16} /></span><span className="nav-label">New file</span></button>
          <button className="nav-item" onClick={pickPforge}><span className="nav-icon"><FolderOpen size={16} /></span><span className="nav-label">Open</span></button>
          <button className="nav-item" onClick={() => openModal("pngToPixel")}><span className="nav-icon"><ImageDown size={16} /></span><span className="nav-label">PNG to Pixel</span></button>
        </div>
        <div className="nav-group">
          <NavItem view="recent" icon={Home} label="Recent" />
          <NavItem view="marketplace" icon={Store} label="Marketplace" />
          <NavItem view="trash" icon={Trash2} label="Recycle Bin" />
        </div>
        <div className="sidebar-foot">
          <div>Được tạo bởi Nguyễn Nhật Long</div>
          <div className="muted">Phiên bản 1.0.0 • 2026</div>
        </div>
      </aside>
      <main className="home-main">
        {homeView === "recent" && <RecentView />}
        {homeView === "trash" && <TrashView />}
        {homeView === "marketplace" && <MarketplaceView />}
      </main>
    </div>
  );
}

function useLocalProjects(deleted: boolean) {
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const refresh = useCallback(async () => {
    try {
      const all = await listProjects();
      setItems(all.filter((p) => !!p.deleted === deleted));
    } catch {
      setItems([]);
    }
  }, [deleted]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { items, refresh };
}

function ProjectGrid({
  items,
  view,
  onOpen,
  actions,
}: {
  items: ProjectSummary[];
  view: "grid" | "list";
  onOpen?: (p: ProjectSummary) => void;
  actions: (p: ProjectSummary) => React.ReactNode;
}) {
  if (!items.length) return <div className="empty">Chưa có project nào.</div>;
  return (
    <div className={view === "grid" ? "project-grid" : "project-list"}>
      {items.map((p) => (
        <div key={p.id} className="project-card" onDoubleClick={() => onOpen?.(p)}>
          <div className="project-thumb checker" onClick={() => onOpen?.(p)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.thumbnail && <img src={p.thumbnail} alt={p.name} />}
            {p.frameCount > 1 && <span className="chip warm tl">{p.frameCount} frames</span>}
            <span className="chip br">{p.width}x{p.height}</span>
          </div>
          <div className="project-meta">
            <div className="project-name">{p.name}</div>
            <div className="muted small">{timeAgo(p.deleted && p.deletedAt ? p.deletedAt : p.updatedAt)}</div>
          </div>
          <div className="project-actions">{actions(p)}</div>
        </div>
      ))}
    </div>
  );
}

function ListHeader({
  title,
  sort,
  setSort,
  desc,
  setDesc,
  filter,
  setFilter,
  view,
  setView,
}: {
  title: string;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  desc: boolean;
  setDesc: (d: boolean) => void;
  filter: string;
  setFilter: (f: string) => void;
  view: "grid" | "list";
  setView: (v: "grid" | "list") => void;
}) {
  return (
    <>
      <div className="home-head">
        <h1>{title}</h1>
        <div className="seg">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="Danh sách"><List size={15} /></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} title="Lưới"><LayoutGrid size={15} /></button>
        </div>
      </div>
      <div className="home-filter">
        <span className="muted">Sắp xếp</span>
        <select className="select inline" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="recent">Gần đây</option>
          <option value="name">Tên</option>
          <option value="size">Kích thước</option>
          <option value="frames">Số frame</option>
        </select>
        <button className="icon-btn" onClick={() => setDesc(!desc)} title="Đảo chiều">{desc ? <ArrowDown size={15} /> : <ArrowUp size={15} />}</button>
        <div className="spacer" />
        <span className="muted">Bộ lọc</span>
        <input className="filter-input" placeholder="Nhập từ khóa để lọc" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
    </>
  );
}

function useSorted(items: ProjectSummary[], sort: SortKey, desc: boolean, filter: string) {
  return useMemo(() => {
    const f = filter.trim().toLowerCase();
    const arr = items.filter((p) => !f || p.name.toLowerCase().includes(f));
    arr.sort((a, b) => {
      let r = 0;
      if (sort === "recent") r = a.updatedAt - b.updatedAt;
      else if (sort === "name") r = a.name.localeCompare(b.name, "vi");
      else if (sort === "size") r = a.width * a.height - b.width * b.height;
      else r = a.frameCount - b.frameCount;
      return desc ? -r : r;
    });
    return arr;
  }, [items, sort, desc, filter]);
}

function RecentView() {
  const { items, refresh } = useLocalProjects(false);
  const { openById } = useProjectActions();
  const notify = useAppStore((s) => s.notify);
  const [sort, setSort] = useState<SortKey>("recent");
  const [desc, setDesc] = useState(true);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const sorted = useSorted(items, sort, desc, filter);

  return (
    <>
      <ListHeader title="Gần đây" sort={sort} setSort={setSort} desc={desc} setDesc={setDesc} filter={filter} setFilter={setFilter} view={view} setView={setView} />
      <ProjectGrid
        items={sorted}
        view={view}
        onOpen={(p) => openById(p.id)}
        actions={(p) => (
          <>
            <button className="btn-ghost sm" onClick={() => openById(p.id)}><FolderInput size={13} /> Mở</button>
            <button
              className="icon-btn sm danger"
              title="Chuyển vào thùng rác"
              onClick={async () => {
                await setDeleted(p.id, true);
                notify(`Đã chuyển "${p.name}" vào Recycle Bin`);
                refresh();
              }}
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      />
    </>
  );
}

function TrashView() {
  const { items, refresh } = useLocalProjects(true);
  const notify = useAppStore((s) => s.notify);
  const [sort, setSort] = useState<SortKey>("recent");
  const [desc, setDesc] = useState(true);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const sorted = useSorted(items, sort, desc, filter);

  return (
    <>
      <ListHeader title="Recycle Bin" sort={sort} setSort={setSort} desc={desc} setDesc={setDesc} filter={filter} setFilter={setFilter} view={view} setView={setView} />
      {items.length > 0 && (
        <div className="home-filter">
          <span className="muted small">{items.length} project trong thùng rác</span>
          <div className="spacer" />
          <button
            className="btn-ghost sm danger"
            onClick={async () => {
              if (!confirm("Xóa vĩnh viễn toàn bộ thùng rác?")) return;
              for (const p of items) await deleteForever(p.id);
              refresh();
            }}
          >
            Dọn sạch thùng rác
          </button>
        </div>
      )}
      <ProjectGrid
        items={sorted}
        view={view}
        actions={(p) => (
          <>
            <button
              className="btn-ghost sm"
              onClick={async () => {
                await setDeleted(p.id, false);
                notify(`Đã khôi phục "${p.name}"`, "success");
                refresh();
              }}
            >
              <RotateCcw size={13} /> Khôi phục
            </button>
            <button
              className="icon-btn sm danger"
              title="Xóa vĩnh viễn"
              onClick={async () => {
                if (!confirm(`Xóa vĩnh viễn "${p.name}"?`)) return;
                await deleteForever(p.id);
                refresh();
              }}
            >
              <X size={13} />
            </button>
          </>
        )}
      />
    </>
  );
}

function MarketplaceView() {
  const [items, setItems] = useState<CloudProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const notify = useAppStore((s) => s.notify);
  const user = useAuthStore((s) => s.user);
  const { openDocument } = useProjectActions();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.get<CloudProject[]>("/marketplace"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = items.filter((p) => {
    const f = filter.trim().toLowerCase();
    return !f || p.name.toLowerCase().includes(f) || p.tags?.some((t) => t.toLowerCase().includes(f)) || p.ownerName?.toLowerCase().includes(f);
  });

  const clone = async (p: CloudProject) => {
    setBusy(p._id);
    try {
      const full = await api.get<CloudProject & { data: PixelDocument }>(`/marketplace/${p._id}`);
      const doc = normalizeDocument(full.data);
      doc.id = uid("d");
      doc.name = `${doc.name} (từ Marketplace)`;
      await openDocument(doc);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const unpublish = async (p: CloudProject) => {
    setBusy(p._id);
    try {
      await api.patch(`/projects/${p._id}/publish`, { published: false });
      refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="home-head">
        <h1>Marketplace</h1>
        <button className="icon-btn" onClick={refresh} title="Làm mới"><RefreshCw size={15} /></button>
      </div>
      <div className="home-filter">
        <span className="muted small">Sprite được cộng đồng chia sẻ. Mở để tạo bản sao vào máy của bạn.</span>
        <div className="spacer" />
        <span className="muted">Bộ lọc</span>
        <input className="filter-input" placeholder="Tên, tag hoặc tác giả" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <div className="empty">Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">Chưa có sprite nào trên Marketplace.</div>
      ) : (
        <div className="project-grid">
          {filtered.map((p) => (
            <div key={p._id} className="project-card">
              <div className="project-thumb checker" onClick={() => clone(p)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumbnail && <img src={p.thumbnail} alt={p.name} />}
                {p.frameCount > 1 && <span className="chip warm tl">{p.frameCount} frames</span>}
                <span className="chip br">{p.width}x{p.height}</span>
              </div>
              <div className="project-meta">
                <div className="project-name">{p.name}</div>
                <div className="muted small">bởi {p.ownerName ?? "ẩn danh"} · {p.downloads ?? 0} lượt tải</div>
                {p.description && <div className="small desc">{p.description}</div>}
                {p.tags && p.tags.length > 0 && (
                  <div className="tag-row">
                    {p.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                  </div>
                )}
              </div>
              <div className="project-actions">
                <button className="btn-ghost sm" disabled={busy === p._id} onClick={() => clone(p)}>Tải về & mở</button>
                {user && p.ownerName === user.name && (
                  <button className="icon-btn sm danger" title="Gỡ khỏi Marketplace" disabled={busy === p._id} onClick={() => unpublish(p)}><X size={13} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
