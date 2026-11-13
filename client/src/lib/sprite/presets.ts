import presetFile from "@/config/sprite-presets.json";
import type { SpritePreset } from "@/types/sprite";

/** Presets live in config/sprite-presets.json; engines receive a preset object and never read constants directly. */
export const SPRITE_PRESETS: SpritePreset[] = (presetFile as { presets: SpritePreset[] }).presets;

export const DEFAULT_PRESET_ID = SPRITE_PRESETS[0]?.id ?? "HY_CHARACTER_V1";

export function getPreset(id: string | null | undefined): SpritePreset | undefined {
  return SPRITE_PRESETS.find((p) => p.id === id);
}

/** Copy of a preset with canvas/anchor overrides (the user may tweak size per sprite without editing the file). */
export function withCanvas(preset: SpritePreset, width: number, height: number): SpritePreset {
  if (width === preset.canvas.width && height === preset.canvas.height) return preset;
  const sx = width / preset.canvas.width;
  const sy = height / preset.canvas.height;
  return {
    ...preset,
    canvas: { width, height },
    footAnchor: { x: Math.round(preset.footAnchor.x * sx), y: Math.min(height - 1, Math.round(preset.footAnchor.y * sy)) },
    contentHeight: Math.max(1, Math.round(preset.contentHeight * sy)),
  };
}

export function validatePreset(p: SpritePreset): string[] {
  const errs: string[] = [];
  if (!p.id) errs.push("thiếu id");
  if (!(p.version >= 1)) errs.push("version phải ≥ 1");
  if (!(p.canvas.width >= 8 && p.canvas.width <= 512 && p.canvas.height >= 8 && p.canvas.height <= 512)) errs.push("canvas phải 8–512 px");
  if (p.footAnchor.x < 0 || p.footAnchor.x >= p.canvas.width || p.footAnchor.y < 0 || p.footAnchor.y >= p.canvas.height) errs.push("footAnchor nằm ngoài canvas");
  if (p.contentHeight < 1 || p.contentHeight > p.footAnchor.y + 1) errs.push("contentHeight vượt quá vị trí chân");
  if (p.maxColors < 2 || p.maxColors > 256) errs.push("maxColors phải 2–256");
  return errs;
}
