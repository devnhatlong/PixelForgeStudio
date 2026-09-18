"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Home, Undo2, Redo2, Save, Layers, Film, Plus, Cloud, Store, Download, User, LogOut, ZoomIn, ZoomOut } from "lucide-react";
import { PixelCanvas } from "./PixelCanvas";
import { Toolbar, useEditorShortcuts } from "./Toolbar";
import { ColorPanel } from "./ColorPanel";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { GridMenu } from "./GridMenu";
import { useEditorStore } from "@/store/editor-store";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { saveProject } from "@/lib/storage";
import { downloadPforge } from "@/lib/pforge";
import { useProjectActions } from "@/hooks/useProjectActions";

export function EditorShell() {
  const doc = useEditorStore((s) => s.doc);
  const dirty = useEditorStore((s) => s.dirty);
  const markSaved = useEditorStore((s) => s.markSaved);
  const renameDocument = useEditorStore((s) => s.renameDocument);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.history.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const tool = useEditorStore((s) => s.tool);
  const closeDocument = useEditorStore((s) => s.closeDocument);

  const openModal = useAppStore((s) => s.openModal);
  const notify = useAppStore((s) => s.notify);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { goHome: navigateHome } = useProjectActions();
  const [showLayers, setShowLayers] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auto-save to IndexedDB (debounced)
  useEffect(() => {
    if (!doc || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveProject(doc);
        markSaved();
        setSavedAt(Date.now());
      } catch {
        /* ignore */
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [doc, dirty, markSaved]);

  const shortcutOpts = useMemo(
    () => ({
      onSave: async () => {
        const d = useEditorStore.getState().doc;
        if (!d) return;
        await saveProject(d);
        markSaved();
        setSavedAt(Date.now());
        downloadPforge(d);
        notify("Đã lưu & tải xuống file .pforge", "success");
      },
      onExport: () => openModal("export"),
    }),
    [markSaved, notify, openModal],
  );
  useEditorShortcuts(shortcutOpts);

  if (!doc) return null;

  const goHome = async () => {
    if (dirty) {
      await saveProject(doc).catch(() => {});
      markSaved();
    }
    const id = doc.id;
    closeDocument();
    navigateHome(id);
  };

  return (
    <div className="editor">
      <header className="editor-topbar">
        <span className="brand-btn" aria-hidden><Home size={16} /></span>
        <span className="brand">PixAsset Create</span>
        <button className="btn-ghost back-btn" onClick={goHome} title="Quay lại Studio (tự động lưu)"><ArrowLeft size={16} /> Studio</button>
        <div className="doc-title">
          {editingName ? (
            <input
              autoFocus
              className="doc-name-input"
              defaultValue={doc.name}
              onBlur={(e) => { renameDocument(e.target.value.trim() || doc.name); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(false); }}
            />
          ) : (
            <span className="doc-name" onDoubleClick={() => setEditingName(true)} title="Nhấp đúp để đổi tên">{doc.name}</span>
          )}
          <span className="chip">{doc.width}x{doc.height}</span>
          <span className={`save-dot ${dirty ? "dirty" : ""}`} title={dirty ? "Đang chờ lưu…" : savedAt ? `Đã lưu ${new Date(savedAt).toLocaleTimeString("vi-VN")}` : "Đã lưu"} />
        </div>

        <div className="topbar-center">
          <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Hoàn tác (Ctrl+Z)"><Undo2 size={16} /></button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Làm lại (Ctrl+Y)"><Redo2 size={16} /></button>
          <span className="divider" />
          <GridMenu />
          <button className="icon-btn" onClick={() => downloadPforge(doc)} title="Lưu file .pforge (Ctrl+S)"><Save size={16} /></button>
          <span className="divider" />
          <button className={`btn-ghost ${showLayers ? "on" : ""}`} onClick={() => setShowLayers(!showLayers)}><Layers size={15} /> Layer</button>
          <button className={`btn-ghost ${showTimeline ? "on" : ""}`} onClick={() => setShowTimeline(!showTimeline)}><Film size={15} /> Timeline ({doc.frames.length})</button>
        </div>

        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => openModal("newSprite")}><Plus size={15} /> Mới / Mẫu</button>
          <button className="btn-ghost" onClick={() => openModal("cloud")}><Cloud size={15} /> Cloud Storage</button>
          <button className="btn-ghost" disabled={!user} title={user ? "" : "Đăng nhập để đăng Marketplace"} onClick={() => openModal("publish")}><Store size={15} /> Đăng Marketplace</button>
          <button className="btn-accent" onClick={() => openModal("export")}><Download size={15} /> Xuất File</button>
          {user ? (
            <button className="btn-ghost" onClick={logout} title={`${user.email} — Đăng xuất`}><LogOut size={15} /> {user.name}</button>
          ) : (
            <button className="btn-ghost" onClick={() => openModal("auth")}><User size={15} /> Đăng nhập</button>
          )}
        </div>
      </header>

      <div className="editor-body">
        <Toolbar />
        <div className={`stage ${tool === "hand" ? "hand" : ""}`}>
          <div className="canvas-wrap">
            <PixelCanvas />
          </div>
          <div className="stage-status left">
            <span className="chip">{doc.width}x{doc.height} px</span>
            <span className="chip accent">{zoom}x</span>
          </div>
          <div className="stage-status right">
            <button className="icon-btn" onClick={() => setZoom(zoom - 2)}><ZoomOut size={16} /></button>
            <span className="small">{zoom * 100}%</span>
            <button className="icon-btn" onClick={() => setZoom(zoom + 2)}><ZoomIn size={16} /></button>
          </div>
        </div>
        <ColorPanel />
        {showLayers && <LayersPanel />}
      </div>

      {showTimeline && <Timeline />}
    </div>
  );
}
