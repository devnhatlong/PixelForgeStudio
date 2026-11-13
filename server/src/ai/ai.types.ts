/** Provider-agnostic image generation contract. Add a provider by implementing ImageProvider and registering it in ai.service.ts. */

export interface ImageInput {
  buffer: Buffer;
  mime: string;
}

export interface GenerateRequest {
  /** animation = sprite sheet of one action for the reference character */
  mode: "master" | "variant" | "animation";
  prompt: string;
  negativePrompt?: string;
  count: number;
  /** aspect hint: target canvas size (e.g. 128×192 → portrait) */
  aspect: { width: number; height: number };
  seed?: number | null;
  /** per-request model / quality overrides (provider defaults when null) */
  model?: string | null;
  quality?: string | null;
  /** variant mode: the approved master image (PNG) */
  reference?: ImageInput | null;
  /** style examples (art style, outline, shading, palette) — not the character to keep */
  styleRefs?: ImageInput[];
  /** optional PNG, same size as reference; white = area allowed to change */
  mask?: ImageInput | null;
}

export interface GeneratedImage {
  /** PNG bytes */
  buffer: Buffer;
  mime: string;
  seed: number | null;
}

export interface ProviderCapabilities {
  /** provider actually conditions on the reference image */
  reference: boolean;
  /** provider can take extra style-example images */
  styleReference: boolean;
  /** provider supports inpainting with a mask */
  mask: boolean;
  seed: boolean;
  maxCount: number;
}

export interface ProviderResult {
  images: GeneratedImage[];
  model: string;
  params: Record<string, unknown>;
  warnings: string[];
}

export interface ImageProvider {
  readonly id: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  /** false when required configuration (API key…) is missing */
  isConfigured(): boolean;
  generate(req: GenerateRequest, signal: AbortSignal): Promise<ProviderResult>;
}

/** Error thrown by providers; `retryable` drives the retry loop. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
