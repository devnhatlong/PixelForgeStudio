/** Sprite pipeline metadata (master / variant workflow). All fields are optional extensions of PixelDocument. */

export type SpriteKind = "master" | "variant";
export type SpriteStatus = "draft" | "reviewed" | "approved";
export type SpriteView = "right_3quarter" | "right" | "front" | "left_3quarter" | "left" | "back";
export type SpritePose = "neutral_idle" | "walk_contact" | "attack_ready" | "custom";

export interface Point2 {
  x: number;
  y: number;
}

export interface SpritePreset {
  id: string;
  version: number;
  name: string;
  description?: string;
  canvas: { width: number; height: number };
  /** where the lowest opaque row (feet) is placed; y = row index of the feet */
  footAnchor: Point2;
  /** target height of the character content in output pixels (fit-height mode) */
  contentHeight: number;
  /** null/undefined = derive palette with median cut; otherwise a palette id from palettes.ts */
  paletteId: string | null;
  maxColors: number;
  alphaThreshold: number;
  resizeMethod: "box" | "nearest";
  defaultView: SpriteView;
  defaultPose: SpritePose;
  /** text appended to every AI prompt using this preset */
  stylePrompt: string;
  negativePrompt: string;
  /** soft limits used by quality checks */
  checks: {
    maxAnchorOffsetPx: number;
    maxStrayClusterSize: number;
    edgeMarginPx: number;
  };
}

export interface GenerationInfo {
  provider: string | null;
  model: string | null;
  prompt: string;
  negativePrompt?: string;
  seed?: number | null;
  mode: "master" | "variant" | "import";
  /** true only if the provider actually received the reference image (and mask) */
  referenceUsed: boolean;
  maskUsed: boolean;
  /** number of art-style example images the provider received */
  styleRefCount?: number;
  /** provider-specific parameters, stored as-is for reproducibility */
  params?: Record<string, unknown>;
  warnings?: string[];
  createdAt: number;
}

export interface CleanupConfig {
  enabled: boolean;
  tolerance: number;
  haloPasses: number;
  haloTolerance: number;
  /** "edge" = flood from the borders (keeps enclosed white areas), "global" = remove every bg-coloured pixel */
  mode: "edge" | "global";
  /** detected/selected background colour */
  color: string | null;
}

export interface NormalizeInfo {
  scaleMode: "fit-height" | "match-master";
  /** output pixels per source pixel */
  scale: number;
  /** content box size in output pixels */
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  /** bounding box of the character in the cleaned source image */
  sourceBBox: { x: number; y: number; w: number; h: number };
  sourceFoot: Point2;
  sourceSize: { width: number; height: number };
}

export interface PixelConfig {
  maxColors: number;
  /**
   * auto = median cut; preset = preset palette; master = strictly master's locked palette;
   * master-snap = quantize freely, then colours close to a master colour become exactly that colour
   * (keeps skin/hair/outline identical while allowing new outfit colours)
   */
  paletteMode: "auto" | "preset" | "master" | "master-snap";
  /** master-snap: max RGB distance (0..441) for snapping to a master colour */
  snapDistance?: number;
  palette: string[] | null;
  alphaThreshold: number;
  resizeMethod: "box" | "nearest";
}

export interface SpriteHistoryEntry {
  at: number;
  action: string;
  note?: string;
}

export interface SpriteMeta {
  kind: SpriteKind;
  /** e.g. HY_MALE_SWORD_001 - groups a master and its variants */
  characterId: string;
  /** for variants: the master document id */
  masterId: string | null;
  /** e.g. BASE, OUTFIT_A */
  outfit: string;
  presetId: string;
  presetVersion: number;
  /** snapshot of the preset at creation time, so re-running stays reproducible if the preset file changes */
  preset: SpritePreset;
  view: SpriteView;
  pose: SpritePose;
  footAnchor: Point2;
  paletteId: string | null;
  status: SpriteStatus;
  /** pixel hash recorded at approval; differs from current pixels if edited after approval */
  approvedHash?: string | null;
  approvedAt?: number | null;
  /** master palette captured on approval; variants snap to it when paletteMode = "master" */
  lockedPalette?: string[] | null;
  sourceAssetId: string | null;
  cleanedAssetId?: string | null;
  maskAssetId?: string | null;
  /** art-style example images (asset ids); variants of this master reuse them by default */
  styleAssetIds?: string[] | null;
  generation: GenerationInfo | null;
  cleanup?: CleanupConfig | null;
  normalize?: NormalizeInfo | null;
  pixel?: PixelConfig | null;
  version: number;
  /** previous document id this one regenerated from (approved versions are never overwritten) */
  previousVersionId?: string | null;
  history: SpriteHistoryEntry[];
}

/** Small subset copied onto ProjectSummary for the library list. */
export interface SpriteSummary {
  kind: SpriteKind;
  characterId: string;
  masterId: string | null;
  outfit: string;
  status: SpriteStatus;
  version: number;
  presetId: string;
  editedAfterApproval?: boolean;
}

export interface QualityIssue {
  id: string;
  level: "error" | "warn" | "info";
  message: string;
}
