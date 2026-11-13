import type { AnimationState } from "@/types/sprite";

/** Default clip settings per animation state (Idle, Run…). */
export const ANIMATION_STATES: { value: AnimationState; label: string; loop: boolean; fps: number }[] = [
  { value: "idle", label: "Idle", loop: true, fps: 6 },
  { value: "walk", label: "Walk", loop: true, fps: 8 },
  { value: "run", label: "Run", loop: true, fps: 12 },
  { value: "jump", label: "Jump", loop: false, fps: 10 },
  { value: "attack", label: "Attack", loop: false, fps: 12 },
  { value: "hit", label: "Hit", loop: false, fps: 10 },
  { value: "death", label: "Death", loop: false, fps: 8 },
  { value: "cast", label: "Cast", loop: false, fps: 10 },
  { value: "release", label: "Release", loop: false, fps: 12 },
  { value: "custom", label: "Khác…", loop: true, fps: 8 },
];
export const TAG_COLORS: Record<AnimationState, string> = {
  idle: "#22c55e", walk: "#84cc16", run: "#eab308", jump: "#38bdf8", attack: "#ef4444", hit: "#f97316", death: "#a855f7", cast: "#06b6d4", release: "#ec4899", custom: "#94a3b8",
};
