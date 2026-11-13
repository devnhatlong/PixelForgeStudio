import { describe, expect, it } from "vitest";
import { atlasLayout, buildUnityJson } from "@/lib/sprite/unity-export";
import type { PixelDocument } from "@/types/editor";

function doc(frames: number): PixelDocument {
  return {
    id: "d",
    name: "Kiem Khach",
    width: 128,
    height: 192,
    layers: [{ id: "l", name: "L", visible: true, locked: false, opacity: 1 }],
    frames: Array.from({ length: frames }, (_, i) => ({ id: `f${i}`, duration: 125, cels: { l: [] } })),
    palette: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("unity export", () => {
  it("lays frames on a padded grid that fits maxWidth", () => {
    const l = atlasLayout(5, 128, 192, 2, 400);
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(2);
    expect(l.width).toBe(3 * 132);
    expect(l.cells[4]).toEqual({ x: 132 + 2, y: 196 + 2 });
  });
  it("frame rects use Unity's bottom-left origin and the feet pivot", () => {
    const { json, layout } = buildUnityJson(doc(5), { tags: [], anchor: { x: 64, y: 174 }, pixelsPerUnit: 64, padding: 2 });
    expect(json.frames[0]).toMatchObject({ name: "Kiem_Khach_0", x: 2, w: 128, h: 192, pivotX: 0.5, pivotY: +((192 - 1 - 174) / 192).toFixed(5), durationMs: 125 });
    expect(json.frames[0].y + json.frames[0].h).toBe(layout.height - 2); // top row sits at the top of the atlas
    expect(json.clips).toEqual([{ name: "Default", state: "custom", fps: 8, loop: true, frames: json.frames.map((f) => f.name), events: [] }]);
  });
  it("tags become clips", () => {
    const { json } = buildUnityJson(doc(6), {
      tags: [
        { id: "a", name: "Idle", state: "idle", from: 0, to: 1, fps: 6, loop: true },
        { id: "b", name: "Attack", state: "attack", from: 2, to: 5, fps: 12, loop: false },
      ],
      anchor: { x: 64, y: 174 },
      pixelsPerUnit: 64,
    });
    expect(json.clips.map((c) => [c.name, c.frames.length, c.fps, c.loop])).toEqual([["Idle", 2, 6, true], ["Attack", 4, 12, false]]);
  });
});
