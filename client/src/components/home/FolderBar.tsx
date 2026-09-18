"use client";

import { useState } from "react";
import { Folder as FolderIcon, FolderPlus, FolderOpen, Pencil, Trash2, Check, X, ChevronRight, Home } from "lucide-react";
import type { Folder } from "@/types/editor";

/** Breadcrumb: Gần đây › Tên thư mục */
export function FolderBreadcrumb({ folder, onRoot }: { folder: Folder | null; onRoot: () => void }) {
  if (!folder) return <>Gần đây</>;
  return (
    <span className="breadcrumb">
      <button className="crumb" onClick={onRoot}><Home size={15} /> Gần đây</button>
      <ChevronRight size={16} className="muted" />
      <span className="crumb current"><FolderOpen size={16} /> {folder.name}</span>
    </span>
  );
}

/** Inline "new folder" control for the header. */
export function NewFolderButton({ onCreate }: { onCreate: (name: string) => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const commit = async () => {
    if (name.trim()) await onCreate(name.trim());
    setName("");
    setEditing(false);
  };
  if (!editing) {
    return (
      <button className="btn-ghost sm" onClick={() => setEditing(true)}><FolderPlus size={14} /> Thư mục mới</button>
    );
  }
  return (
    <span className="inline-edit">
      <input
        autoFocus
        className="text-input sm"
        placeholder="Tên thư mục"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button className="icon-btn sm" onClick={commit} title="Tạo"><Check size={13} /></button>
      <button className="icon-btn sm" onClick={() => setEditing(false)} title="Hủy"><X size={13} /></button>
    </span>
  );
}

export function FolderCard({
  folder,
  count,
  onOpen,
  onRename,
  onDelete,
  onDropProject,
}: {
  folder: Folder;
  count: number;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDropProject: (projectId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`folder-card ${over ? "drop-over" : ""}`}
      onClick={() => !editing && onOpen()}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/pf-project")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/pf-project");
        if (id) onDropProject(id);
      }}
    >
      <span className="folder-icon"><FolderIcon size={22} /></span>
      <div className="folder-info">
        {editing ? (
          <input
            autoFocus
            className="text-input sm"
            defaultValue={folder.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { onRename(e.target.value); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="folder-name" title={folder.name}>{folder.name}</span>
        )}
        <span className="muted small">{count} sprite</span>
      </div>
      <div className="folder-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sm" title="Đổi tên" onClick={() => setEditing(true)}><Pencil size={12} /></button>
        <button className="icon-btn sm danger" title="Xóa thư mục (sprite được đưa về Gần đây)" onClick={onDelete}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

/** Root drop zone shown while inside a folder: drag a project here to move it back to root. */
export function RootDropZone({ onDropProject }: { onDropProject: (projectId: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`root-drop ${over ? "drop-over" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/pf-project")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/pf-project");
        if (id) onDropProject(id);
      }}
    >
      <Home size={14} /> Kéo sprite vào đây để đưa về Gần đây
    </div>
  );
}
