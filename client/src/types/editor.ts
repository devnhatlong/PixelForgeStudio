export type EditorTool =
  | "pencil"
  | "eraser"
  | "fill"
  | "eyedropper"
  | "select"
  | "wand"
  | "move"
  | "hand"
  | "zoom"
  | "line"
  | "rect"
  | "ellipse"
  | "dither"
  | "lighten"
  | "darken";

export type MirrorMode = "off" | "horizontal" | "vertical" | "both";

/** Layer metadata shared across all frames. Pixel data lives in Frame.cels. */
export interface LayerMeta {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
}

export interface Frame {
  id: string;
  /** milliseconds */
  duration: number;
  /** layerId -> pixel array ("" = transparent, otherwise "#rrggbb") */
  cels: Record<string, string[]>;
}

export interface PixelDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: LayerMeta[];
  frames: Frame[];
  /** custom palette colors */
  palette: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Selection {
  /** width*height mask, 1 = selected */
  mask: Uint8Array;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Floating pixels while moving a selection. */
export interface FloatingBuffer {
  pixels: string[];
  mask: Uint8Array;
  offsetX: number;
  offsetY: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  frameCount: number;
  thumbnail: string;
  updatedAt: number;
  deleted?: boolean;
  deletedAt?: number;
  cloudId?: string;
}
