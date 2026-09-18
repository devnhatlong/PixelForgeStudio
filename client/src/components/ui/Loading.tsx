"use client";

import { Loader2 } from "lucide-react";

/** Inline spinner (use inside buttons, labels). */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`spin ${className}`} aria-hidden />;
}

/** Centered loading block for panels / lists. */
export function LoadingBlock({ label = "Đang tải…", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`loading-block ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <Spinner size={compact ? 16 : 22} />
      <span>{label}</span>
    </div>
  );
}

/** Full-screen overlay used while opening / converting documents. */
export function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="loading-overlay" role="status" aria-live="assertive">
      <div className="loading-card">
        <Spinner size={26} />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Skeleton placeholder for a project card grid. */
export function ProjectGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="project-grid" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="project-card">
          <div className="skeleton skel-thumb" />
          <div className="project-meta">
            <div className="skeleton skel-line w60" />
            <div className="skeleton skel-line w35" />
          </div>
        </div>
      ))}
    </div>
  );
}
