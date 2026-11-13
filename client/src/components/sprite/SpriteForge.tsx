"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Wand2, ImageUp, Sparkles, Save, AlertTriangle, Layers, Eye, EyeOff, RefreshCw, Crown, Shirt, X, Lock, Settings, ImagePlus, ScanEye, MessageSquare, Bot, Trash2, Grid3x3, Dna, Film } from "lucide-react";
import { AI_CHANGED_EVENT } from "./AiSettingsModal";
import { STUDIO_PATH, useProjectActions } from "@/hooks/useProjectActions";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { createDocument } from "@/lib/document";
import { listProjects } from "@/lib/storage";
import { ensureLocalDocument } from "@/lib/sync";
import { PALETTES } from "@/lib/palettes";
import type { RgbaImage } from "@/lib/png-to-pixel";
import { DEFAULT_CLEANUP, alphaMaskImage, detectBackground } from "@/lib/sprite/background";
import { runSpritePipeline, type PipelineResult } from "@/lib/sprite/pipeline";
import { runQualityChecks } from "@/lib/sprite/quality";
import { DEFAULT_PRESET_ID, SPRITE_PRESETS, getPreset, withCanvas } from "@/lib/sprite/presets";
import { flattenFrame, sanitizeId } from "@/lib/sprite/meta";
import { base64ToBlob, blobToRgba, canvasToPng, getAssetBlob, rgbaToPng, saveAsset, shrinkToPng } from "@/lib/sprite/assets";
import { describeImage, generateImages, getAiInfo, type AiGenerateResult, type AiInfo } from "@/lib/sprite/ai-client";
import { AiAssistant } from "./AiAssistant";
import { SheetSlicerModal } from "./SheetSlicerModal";
import { DnaCompareCard } from "./Dna";
import { ANIMATION_STATES } from "@/lib/sprite/anim-states";
import { compareToMaster, dnaPrompt } from "@/lib/sprite/dna";
import type { PixelDocument, ProjectSummary } from "@/types/editor";
import type { CleanupConfig, GenerationInfo, PixelConfig, SpriteMeta, SpritePose, SpriteView, AnimationState } from "@/types/sprite";
import { BgPicker, PixelPreview, RgbaPreview, ZoomPicker, type PreviewBg } from "./Previews";
import { QualityList } from "./QualityList";
import { MaskPainter, maskToRgba, type MaskData } from "./MaskPainter";
import { Spinner } from "@/components/ui/Loading";
import { Select } from "@/components/ui/Select";

interface Candidate {
  id: string;
  blob: Blob;
  rgba: RgbaImage;
  url: string;
  seed: number | null;
  origin: "ai" | "import";
  name?: string;
}

const VIEWS: { id: SpriteView; label: string }[] = [
  { id: "right_3quarter", label: "3/4 sang phải" },
  { id: "right", label: "Ngang sang phải" },
  { id: "front", label: "Chính diện" },
  { id: "left_3quarter", label: "3/4 sang trái" },
  { id: "back", label: "Sau lưng" },
];
const POSES: { id: SpritePose; label: string; hint: string; prompt: string }[] = [
  { id: "neutral_idle", label: "Đứng trung tính", hint: "Idle - dùng cho master", prompt: "standing neutral idle pose" },
  { id: "walk_contact", label: "Bước đi", hint: "Contact pose", prompt: "walking, contact pose" },
  { id: "attack_ready", label: "Thủ thế", hint: "Cầm kiếm sẵn sàng", prompt: "ready combat stance holding the sword" },
  { id: "custom", label: "Tùy chỉnh", hint: "Theo mô tả của bạn", prompt: "" },
];
const VIEW_PROMPT: Record<SpriteView, string> = {
  right_3quarter: "three-quarter view facing right",
  right: "side view facing right",
  front: "front view",
  left_3quarter: "three-quarter view facing left",
  left: "side view facing left",
  back: "back view",
};

const ANIM_GRID: Record<4 | 6 | 8, [number, number]> = { 4: [2, 2], 6: [3, 2], 8: [4, 2] };
const ANIM_PROMPT: Record<AnimationState, string> = {
  idle: "idle breathing loop (subtle up-down body motion, hair and cloth sway)",
  walk: "walk cycle loop (contact, down, passing, up poses)",
  run: "run cycle loop (both feet off the ground in passing frames, leaning forward)",
  jump: "jump (crouch, take-off, airborne, fall, landing)",
  attack: "sword slash attack (wind-up, strike, follow-through, recover)",
  hit: "hit reaction (flinch backwards, recover)",
  death: "death (stagger, fall, lie on the ground)",
  cast: "skill casting (gather energy, hands forward)",
  release: "skill release (thrust forward, energy burst, recover)",
  custom: "action",
};
const ANIM_HINT: Record<AnimationState, string> = {
  idle: "Đứng thở, lặp", walk: "Đi bộ, lặp", run: "Chạy, lặp", jump: "Nhảy", attack: "Chém", hit: "Trúng đòn", death: "Gục ngã", cast: "Vận chiêu", release: "Tung chiêu", custom: "",
};

/** canvas aspect ratios offered next to the canvas size (w:h) */
const ASPECTS: { id: string; w: number; h: number; label: string; hint: string }[] = [
  { id: "free", w: 0, h: 0, label: "Tự do", hint: "Nhập rộng × cao tùy ý" },
  { id: "2:3", w: 2, h: 3, label: "2:3", hint: "Nhân vật đứng (preset Huyền Ấn)" },
  { id: "3:4", w: 3, h: 4, label: "3:4", hint: "Nhân vật thấp / chibi đậm" },
  { id: "9:16", w: 9, h: 16, label: "9:16", hint: "Nhân vật cao, boss đứng" },
  { id: "1:1", w: 1, h: 1, label: "1:1", hint: "Vuông — quái nhỏ, item, chân dung" },
  { id: "4:3", w: 4, h: 3, label: "4:3", hint: "Quái to, thú cưỡi" },
  { id: "3:2", w: 3, h: 2, label: "3:2", hint: "Ngang — vũ khí dài, thú" },
  { id: "16:9", w: 16, h: 9, label: "16:9", hint: "Ngang rộng — rồng, xe, hiệu ứng skill" },
];
const SIZE_STEPS = [64, 96, 128, 160, 192, 256, 320, 384, 512];
const clampPx = (n: number) => Math.max(16, Math.min(512, Math.round(n) || 16));
function detectAspect(w: number, h: number): string {
  return ASPECTS.find((a) => a.w && Math.abs(w / h - a.w / a.h) < 0.02)?.id ?? "free";
}
/** keep the height (character size), adjust the width; shrink both if the width would exceed 512 */
function fitAspect(w: number, h: number, id: string): [number, number] {
  const a = ASPECTS.find((x) => x.id === id);
  if (!a || !a.w) return [w, h];
  let W = Math.round((h * a.w) / a.h),
    H = h;
  if (W > 512) {
    W = 512;
    H = Math.round((512 * a.h) / a.w);
  }
  return [clampPx(W), clampPx(H)];
}

/** heuristic: several paragraphs or motion verbs → the user is describing an animation in the wrong mode */
function looksLikeMotion(text: string): boolean {
  const paragraphs = text.split(/\n\s*\n/).filter((x) => x.trim()).length;
  const verbs = (text.match(/\b(walk(ing)?|run(ning)?|slash|jump|crouch|stagger|flinch|breathing|thrust|swing(s)?|recoil|fall(s)?|land)\b/gi) ?? []).length;
  return paragraphs >= 3 || verbs >= 3;
}

const VARIANT_PREFIX =
  "Use the reference image as the same character. Keep exactly the same face, hairstyle, head size, body proportions, pose, camera angle, size and position on the canvas. Only change the clothing inside the editable (masked) area to:";

async function masterReference(master: PixelDocument): Promise<{ blob: Blob; rgba: RgbaImage; fromSource: boolean }> {
  const src = await getAssetBlob(master.sprite?.sourceAssetId).catch(() => null);
  if (src) return { blob: src, rgba: await blobToRgba(src), fromSource: true };
  // no stored source (hand-drawn master): upscale the pixels ×8 on white
  const flat = flattenFrame(master);
  const k = 8;
  const c = document.createElement("canvas");
  c.width = master.width * k;
  c.height = master.height * k;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  flat.pixels.forEach((p, i) => {
    if (!p) return;
    ctx.fillStyle = p;
    ctx.fillRect((i % master.width) * k, Math.floor(i / master.width) * k, k, k);
  });
  const blob = await canvasToPng(c);
  return { blob, rgba: ctx.getImageData(0, 0, c.width, c.height), fromSource: false };
}

export function SpriteForge() {
  const params = useSearchParams();
  const router = useRouter();
  const masterParam = params.get("master");
  const regenParam = params.get("regen");
  const modeParam = params.get("mode");
  const notify = useAppStore((s) => s.notify);
  const openModal = useAppStore((s) => s.openModal);
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.ready);
  const { openDocument } = useProjectActions();

  // ---- setup
  const [mode, setMode] = useState<"master" | "variant" | "animation">(masterParam ? (modeParam === "animation" ? "animation" : "variant") : "master");
  /** variant + animation both start from an approved master */
  const usesMaster = mode !== "master";
  // animation mode: one action of the master, generated as a sprite sheet then sliced
  const [animState, setAnimState] = useState<AnimationState>("idle");
  const [animFrames, setAnimFrames] = useState<4 | 6 | 8>(6);
  const animGrid = ANIM_GRID[animFrames];
  const [masters, setMasters] = useState<ProjectSummary[]>([]);
  const [masterDoc, setMasterDoc] = useState<PixelDocument | null>(null);
  const [reference, setReference] = useState<{ blob: Blob; rgba: RgbaImage; fromSource: boolean } | null>(null);
  const [mask, setMask] = useState<MaskData | null>(null);
  const [regenFrom, setRegenFrom] = useState<PixelDocument | null>(null);
  /** art-style examples (≤3); assetId set once stored (reused from the master for variants) */
  const [styleRefs, setStyleRefs] = useState<{ key: string; blob: Blob; url: string; name: string; assetId?: string }[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [characterId, setCharacterId] = useState("");
  /** ID follows the name until the user edits the ID by hand */
  const [idTouched, setIdTouched] = useState(false);
  const [outfit, setOutfit] = useState("BASE");
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const basePreset = getPreset(presetId) ?? SPRITE_PRESETS[0];
  const [canvasW, setCanvasW] = useState(basePreset.canvas.width);
  const [canvasH, setCanvasH] = useState(basePreset.canvas.height);
  const [aspect, setAspect] = useState(() => detectAspect(basePreset.canvas.width, basePreset.canvas.height));
  const aspectDef = ASPECTS.find((a) => a.id === aspect)!;
  /** width/height edits keep the chosen ratio */
  const changeW = (v: number) => {
    const w = clampPx(v);
    setCanvasW(w);
    if (aspectDef.w) setCanvasH(clampPx((w * aspectDef.h) / aspectDef.w));
  };
  const changeH = (v: number) => {
    const h = clampPx(v);
    setCanvasH(h);
    if (aspectDef.w) setCanvasW(clampPx((h * aspectDef.w) / aspectDef.h));
  };
  const chooseAspect = (id: string) => {
    setAspect(id);
    const [w, h] = fitAspect(canvasW, canvasH, id);
    setCanvasW(w);
    setCanvasH(h);
  };
  const preset = useMemo(() => withCanvas(basePreset, canvasW, canvasH), [basePreset, canvasW, canvasH]);
  const [view, setView] = useState<SpriteView>(basePreset.defaultView);
  const [pose, setPose] = useState<SpritePose>(basePreset.defaultPose);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState(basePreset.negativePrompt);
  const [count, setCount] = useState(2);
  const [seed, setSeed] = useState<string>("");

  // ---- generation
  const [aiInfo, setAiInfo] = useState<AiInfo | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [gen, setGen] = useState<AiGenerateResult | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  // ---- processing
  const [cleanup, setCleanup] = useState<CleanupConfig>(DEFAULT_CLEANUP);
  const [pixel, setPixel] = useState<PixelConfig>({
    maxColors: basePreset.maxColors,
    paletteMode: "auto",
    palette: null,
    alphaThreshold: basePreset.alphaThreshold,
    resizeMethod: basePreset.resizeMethod,
  });
  const [scaleMode, setScaleMode] = useState<"fit-height" | "match-master">("fit-height");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [bg, setBg] = useState<PreviewBg>("checker");
  const [overlayOn, setOverlayOn] = useState(true);
  const [srcView, setSrcView] = useState<"cleaned" | "mask" | "original">("cleaned");
  const [saving, setSaving] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [slicerFor, setSlicerFor] = useState<Candidate | null>(null);
  // per-Generate model / quality (remembered in this browser; empty = server default from Cài đặt AI)
  const [genModel, setGenModel] = useState<string>(() => (typeof window === "undefined" ? "" : localStorage.getItem("pf:gen-model") ?? ""));
  const [genQuality, setGenQuality] = useState<string>(() => (typeof window === "undefined" ? "" : localStorage.getItem("pf:gen-quality") ?? ""));
  useEffect(() => {
    localStorage.setItem("pf:gen-model", genModel);
    localStorage.setItem("pf:gen-quality", genQuality);
  }, [genModel, genQuality]);
  const [reading, setReading] = useState(false);

  /** "Đọc ảnh": the AI looks at a picture and writes the description (character, or outfit in variant mode). */
  const readImage = async (file: File | Blob | null | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return notify("Chỉ nhận PNG/JPEG/WebP", "error");
    setReading(true);
    try {
      const { blob } = await shrinkToPng(file, 1024);
      const r = await describeImage(blob, mode === "variant" ? "outfit" : mode === "animation" ? "character" : "character");
      setPrompt(r.text);
      notify(r.mock ? "Mock: mô tả mẫu (bật OpenAI để đọc ảnh thật)" : "AI đã đọc ảnh và viết mô tả — kiểm tra / sửa lại trước khi Generate", r.mock ? "info" : "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setReading(false);
    }
  };

  const refreshAi = useCallback(() => {
    getAiInfo()
      .then((i) => {
        setAiInfo(i);
        setAiError(null);
      })
      .catch((e) => setAiError((e as Error).message));
  }, []);
  useEffect(() => {
    if (authReady) refreshAi();
    window.addEventListener(AI_CHANGED_EVENT, refreshAi);
    return () => window.removeEventListener(AI_CHANGED_EVENT, refreshAi);
  }, [authReady, user, refreshAi]);

  useEffect(() => {
    listProjects()
      .then((all) => setMasters(all.filter((p) => !p.deleted && p.sprite?.kind === "master")))
      .catch(() => setMasters([]));
  }, []);

  const loadMaster = useCallback(
    async (id: string | null) => {
      setMask(null);
      if (!id) {
        setMasterDoc(null);
        setReference(null);
        return;
      }
      const d = await ensureLocalDocument(id).catch(() => undefined);
      if (!d?.sprite) {
        notify("Không mở được master", "error");
        return;
      }
      setMasterDoc(d);
      setCharacterId(d.sprite.characterId);
      setDisplayName(d.name.split(" - ")[0] || d.name);
      const p = getPreset(d.sprite.presetId) ?? d.sprite.preset;
      setPresetId(p.id);
      setCanvasW(d.width);
      setCanvasH(d.height);
      setAspect(detectAspect(d.width, d.height));
      setView(d.sprite.view);
      setPose(d.sprite.pose);
      setScaleMode(d.sprite.normalize ? "match-master" : "fit-height");
      setPixel((px) => ({ ...px, paletteMode: "master-snap" }));
      setReference(await masterReference(d));
      // reuse the master's style examples so variants keep the same look
      const refs: { key: string; blob: Blob; url: string; name: string; assetId?: string }[] = [];
      for (const id of d.sprite.styleAssetIds ?? []) {
        const b = await getAssetBlob(id).catch(() => null);
        if (b) refs.push({ key: id, blob: b, url: URL.createObjectURL(b), name: "mẫu của master", assetId: id });
      }
      setStyleRefs(refs);
    },
    [notify],
  );

  // deep links: ?master=<id> (new variant), ?regen=<id> (new version of an existing sprite)
  useEffect(() => {
    if (!authReady) return;
    (async () => {
      if (regenParam) {
        const d = await ensureLocalDocument(regenParam).catch(() => undefined);
        const s = d?.sprite;
        if (!d || !s) return;
        setRegenFrom(d);
        setMode(s.kind);
        setOutfit(s.outfit);
        setCharacterId(s.characterId);
        setDisplayName(d.name.split(" - ")[0] || d.name);
        if (s.generation?.prompt) setPrompt(s.generation.prompt);
        if (s.cleanup) setCleanup(s.cleanup);
        if (s.pixel) setPixel(s.pixel);
        if (s.kind === "variant") await loadMaster(s.masterId);
        else {
          setCanvasW(d.width);
          setCanvasH(d.height);
          setView(s.view);
          setPose(s.pose);
        }
        // the previous source image is offered as a candidate so the pipeline can be re-run with new settings
        const blob = await getAssetBlob(s.sourceAssetId).catch(() => null);
        if (blob) {
          const c: Candidate = { id: "prev", blob, rgba: await blobToRgba(blob), url: URL.createObjectURL(blob), seed: s.generation?.seed ?? null, origin: "import", name: "Ảnh nguồn của bản trước" };
          setCandidates([c]);
          setSelectedId(c.id);
        }
      } else if (masterParam) {
        if (modeParam === "animation") setMode("animation");
        else {
          setMode("variant");
          setOutfit("OUTFIT_A");
        }
        await loadMaster(masterParam);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, masterParam, regenParam, modeParam]);

  const masterPalette = useMemo(
    () => (masterDoc ? masterDoc.sprite?.lockedPalette ?? Array.from(new Set(flattenFrame(masterDoc).pixels.filter(Boolean))) : null),
    [masterDoc],
  );
  // fixed palette for quantization (strict modes only)
  const effectivePalette = useMemo(() => {
    if (pixel.paletteMode === "master") return masterPalette;
    if (pixel.paletteMode === "preset" && basePreset.paletteId) return PALETTES.find((p) => p.id === basePreset.paletteId)?.colors ?? null;
    return null;
  }, [pixel.paletteMode, masterPalette, basePreset.paletteId]);
  const snapPalette = useMemo(
    () => (pixel.paletteMode === "master-snap" && masterPalette?.length ? { colors: masterPalette, maxDistance: pixel.snapDistance ?? 28 } : null),
    [pixel.paletteMode, pixel.snapDistance, masterPalette],
  );

  const masterFlat = useMemo(() => (masterDoc ? flattenFrame(masterDoc) : null), [masterDoc]);
  const masterScale = useMemo(() => {
    const n = masterDoc?.sprite?.normalize;
    if (!n || !selected || scaleMode !== "match-master") return null;
    // body size relative to the image height is what stays constant between generations of the same provider
    return n.scale * (n.sourceSize.height / selected.rgba.height);
  }, [masterDoc, selected, scaleMode]);

  // run the pipeline (debounced; source image is never modified)
  useEffect(() => {
    if (!selected) {
      setResult(null);
      return;
    }
    setProcessing(true);
    const t = setTimeout(() => {
      try {
        setResult(
          runSpritePipeline(selected.rgba, {
            preset,
            cleanup,
            pixel: { ...pixel, palette: effectivePalette },
            scaleOverride: masterScale,
            snapPalette,
          }),
        );
      } finally {
        setProcessing(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [selected, preset, cleanup, pixel, effectivePalette, masterScale, snapPalette]);

  // background guess for the selected image
  const bgGuess = useMemo(() => (selected ? detectBackground(selected.rgba) : null), [selected]);

  const srcImage = useMemo(() => {
    if (!selected) return null;
    if (!result || srcView === "original") return selected.rgba;
    return srcView === "mask" ? alphaMaskImage(result.cleanup.image, pixel.alphaThreshold) : result.cleanup.image;
  }, [selected, result, srcView, pixel.alphaThreshold]);

  const dnaCmp = useMemo(
    () => (result && masterFlat && mode === "variant" ? compareToMaster({ width: preset.canvas.width, height: preset.canvas.height, pixels: result.pixels }, masterFlat, masterDoc?.sprite?.dna) : null),
    [result, masterFlat, mode, preset.canvas.width, preset.canvas.height, masterDoc?.sprite?.dna],
  );

  const quality = useMemo(() => {
    if (!result) return null;
    return runQualityChecks({ width: preset.canvas.width, height: preset.canvas.height, pixels: result.pixels }, preset, {
      master: mode === "variant" ? masterFlat : null,
      lockedPalette: mode === "variant" && (pixel.paletteMode === "master" || pixel.paletteMode === "master-snap") ? masterPalette : null,
      paletteStrict: pixel.paletteMode === "master",
    });
  }, [result, preset, mode, masterFlat, pixel.paletteMode, masterPalette]);

  const finalPrompt = useMemo(() => {
    const posePrompt = POSES.find((p) => p.id === pose)?.prompt;
    const style = basePreset.stylePrompt;
    const core = [prompt.trim(), VIEW_PROMPT[view], posePrompt].filter(Boolean).join(", ");
    const n = styleRefs.length;
    const styleNote = !n
      ? ""
      : mode === "variant"
        ? `\nThe first input image is the character to keep. The other ${n} image(s) are ART STYLE examples only: match their drawing style (pixel density, outline, shading, palette feel), do not copy their characters or content.`
        : `\nThe ${n} input image(s) are ART STYLE examples only: draw a NEW character as described, matching their drawing style (pixel density, outline thickness, shading, color palette feel, proportions). Do not copy the characters, faces, clothing or content of the examples.`;
    const dnaText = dnaPrompt(usesMaster ? masterDoc?.sprite?.dna : regenFrom?.sprite?.dna);
    if (mode === "animation") {
      const [c, r] = animGrid;
      const extra = prompt.trim() ? ` Motion notes: ${prompt.trim()}.` : "";
      return `Pixel art sprite sheet of a ${ANIM_PROMPT[animState]} animation for the EXACT same character as the reference image: same face, hair, outfit, colors, weapon and body proportions.${extra} ${animFrames} frames in a grid of ${c} columns and ${r} rows, read left-to-right then top-to-bottom, smooth consecutive motion. Every frame the same size, the character the same size in every frame, ${VIEW_PROMPT[view]}, feet on the same ground line in every cell, evenly spaced, generous empty space between frames, no overlapping. Plain solid white background, no text, no numbers, no grid lines, no borders.${dnaText}\nStyle: ${style}${styleNote}`;
    }
    return mode === "variant" ? `${VARIANT_PREFIX} ${prompt.trim()}.${dnaText}\nStyle: ${style}${styleNote}` : `${core}.${dnaText}\nStyle: ${style}${styleNote}`;
  }, [prompt, view, pose, mode, basePreset.stylePrompt, styleRefs.length, masterDoc?.sprite?.dna, regenFrom?.sprite?.dna, animState, animFrames, animGrid]);

  const addStyleFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const room = 3 - styleRefs.length;
    if (room <= 0) return notify("Tối đa 3 ảnh mẫu phong cách", "error");
    const added: typeof styleRefs = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
        notify(`${f.name}: chỉ nhận PNG/JPEG/WebP`, "error");
        continue;
      }
      try {
        const { blob } = await shrinkToPng(f, 1024);
        added.push({ key: `sty${Date.now().toString(36)}${added.length}`, blob, url: URL.createObjectURL(blob), name: f.name });
      } catch {
        notify(`${f.name}: không đọc được ảnh`, "error");
      }
    }
    setStyleRefs((prev) => [...prev, ...added].slice(0, 3));
  };

  const addCandidates = (list: Candidate[]) => {
    setCandidates((prev) => [...list, ...prev].slice(0, 12));
    if (list[0]) setSelectedId(list[0].id);
  };

  /** Remove candidates from this session only (saved sprites keep their own copy of the source image). */
  const removeCandidates = (ids: string[]) => {
    const drop = new Set(ids);
    const remaining = candidates.filter((c) => !drop.has(c.id));
    candidates.filter((c) => drop.has(c.id)).forEach((c) => URL.revokeObjectURL(c.url));
    setCandidates(remaining);
    if (selectedId && drop.has(selectedId)) {
      // select the neighbour of the removed one, if any
      const idx = candidates.findIndex((c) => c.id === selectedId);
      const next = remaining[Math.min(idx, remaining.length - 1)];
      setSelectedId(next?.id ?? null);
    }
  };

  const generate = async () => {
    if (usesMaster && !reference) return notify(mode === "animation" ? "Chọn master trước khi tạo animation" : "Chọn master trước khi tạo variant", "error");
    setBusy(true);
    setAiError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const maskBlob = mode === "variant" && mask && reference ? await rgbaToPng(maskToRgba(mask, reference.rgba.width, reference.rgba.height)) : null;
      const res = await generateImages(
        {
          mode,
          prompt: finalPrompt,
          negativePrompt: negative,
          count,
          width: mode === "animation" ? preset.canvas.width * animGrid[0] : preset.canvas.width,
          height: mode === "animation" ? preset.canvas.height * animGrid[1] : preset.canvas.height,
          seed: seed.trim() ? Number(seed) : null,
          model: effectiveGenModel,
          quality: effectiveGenQuality,
          reference: usesMaster ? reference?.blob : null,
          mask: maskBlob,
          styleRefs: styleRefs.map((s) => s.blob),
        },
        ctrl.signal,
      );
      setGen(res);
      const list: Candidate[] = [];
      for (const c of res.candidates) {
        const blob = base64ToBlob(c.dataBase64, c.mime);
        list.push({ id: c.id, blob, rgba: await blobToRgba(blob), url: URL.createObjectURL(blob), seed: c.seed, origin: "ai" });
      }
      addCandidates(list);
      if (mode === "animation" && list[0]) setSlicerFor(list[0]);
      setAiInfo((i) => (i ? { ...i, usage: res.usage } : i));
      notify(`Đã tạo ${list.length} phương án${res.estimatedCostUsd ? ` (~$${res.estimatedCostUsd})` : ""}`, "success");
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list: Candidate[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
        notify(`${f.name}: chỉ nhận PNG/JPEG/WebP`, "error");
        continue;
      }
      try {
        list.push({ id: `imp${Date.now().toString(36)}${list.length}`, blob: f, rgba: await blobToRgba(f), url: URL.createObjectURL(f), seed: null, origin: "import", name: f.name });
      } catch {
        notify(`${f.name}: không đọc được ảnh`, "error");
      }
    }
    addCandidates(list);
  };

  const save = async () => {
    if (!selected || !result || !result.bbox || mode === "animation") return; // animations are saved from the sheet slicer
    const errors = quality?.issues.filter((i) => i.level === "error") ?? [];
    if (errors.length && !confirm(`Còn ${errors.length} lỗi:\n- ${errors.map((e) => e.message).join("\n- ")}\n\nVẫn lưu dưới dạng Draft?`)) return;
    setSaving(true);
    try {
      const W = preset.canvas.width;
      const H = preset.canvas.height;
      const sourceAssetId = await saveAsset(selected.blob, "source", { width: selected.rgba.width, height: selected.rgba.height });
      const cleanedAssetId = cleanup.enabled ? await saveAsset(await rgbaToPng(result.cleanup.image), "cleaned", { width: selected.rgba.width, height: selected.rgba.height }) : null;
      const maskAssetId =
        mode === "variant" && mask && reference && selected.origin === "ai"
          ? await saveAsset(await rgbaToPng(maskToRgba(mask, reference.rgba.width, reference.rgba.height)), "mask", { width: reference.rgba.width, height: reference.rgba.height })
          : null;
      const fromAi = selected.origin === "ai" && gen;
      // style examples: keep ids already stored (e.g. inherited from the master), store new ones
      const styleAssetIds: string[] = [];
      for (const s of styleRefs) styleAssetIds.push(s.assetId ?? (await saveAsset(s.blob, "reference", { width: 0, height: 0 })));
      const generation: GenerationInfo = {
        provider: fromAi ? gen.provider : regenFrom?.sprite?.generation?.provider ?? null,
        model: fromAi ? gen.model : regenFrom?.sprite?.generation?.model ?? null,
        prompt: fromAi ? prompt : regenFrom?.sprite?.generation?.prompt ?? prompt,
        negativePrompt: negative,
        seed: selected.seed,
        mode: fromAi ? mode : "import",
        referenceUsed: fromAi ? gen.referenceUsed : false,
        maskUsed: fromAi ? gen.maskUsed : false,
        styleRefCount: fromAi ? gen.styleRefsUsed ?? 0 : 0,
        params: fromAi ? { ...gen.params, finalPrompt, count } : { importedFile: selected.name ?? null },
        warnings: fromAi ? gen.warnings : [],
        createdAt: Date.now(),
      };
      const outfitId = sanitizeId(outfit) || (mode === "master" ? "BASE" : "OUTFIT");
      const charId = sanitizeId(characterId) || sanitizeId(displayName) || `CHAR_${Date.now().toString(36).toUpperCase()}`;
      const name = `${displayName.trim() || charId} - ${outfitId}${regenFrom ? ` v${(regenFrom.sprite?.version ?? 1) + 1}` : ""}`;
      const doc = createDocument(name, W, H);
      doc.layers[0].name = "Sprite";
      doc.frames[0].cels[doc.layers[0].id] = result.pixels;
      doc.palette = result.palette;
      const sprite: SpriteMeta = {
        kind: mode,
        characterId: charId,
        masterId: mode === "variant" ? masterDoc?.id ?? null : null,
        outfit: outfitId,
        presetId: basePreset.id,
        presetVersion: basePreset.version,
        preset,
        view,
        pose,
        footAnchor: preset.footAnchor,
        paletteId: basePreset.paletteId,
        status: "draft",
        approvedHash: null,
        lockedPalette: null,
        sourceAssetId,
        cleanedAssetId,
        maskAssetId,
        styleAssetIds: styleAssetIds.length ? styleAssetIds : null,
        generation,
        cleanup: { ...cleanup, color: result.cleanup.color },
        normalize: result.normalize,
        pixel: { ...pixel, palette: effectivePalette },
        version: regenFrom ? (regenFrom.sprite?.version ?? 1) + 1 : 1,
        previousVersionId: regenFrom?.id ?? null,
        history: [
          { at: Date.now(), action: "created", note: `${generation.mode} via ${generation.provider ?? "import"}${regenFrom ? ` (regenerate từ ${regenFrom.id})` : ""}` },
          ...result.warnings.map((w) => ({ at: Date.now(), action: "pipeline-warning", note: w })),
        ],
      };
      doc.sprite = sprite;
      await openDocument(doc);
      notify("Đã lưu Draft - sửa pixel trong editor rồi bấm nút trạng thái sprite để duyệt", "success");
    } catch (e) {
      notify(`Lưu thất bại: ${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const imageModels = aiInfo?.imageModels ?? [];
  // ignore a remembered model that the server no longer offers
  const effectiveGenModel = imageModels.some((m) => m.id === genModel) ? genModel : aiInfo?.model ?? null;
  const effectiveGenQuality = aiInfo?.qualities?.includes(genQuality) ? genQuality : aiInfo?.defaultQuality ?? null;
  const maskRisk = mode === "variant" && !!mask && !!effectiveGenModel && /gpt-image-2\.6/.test(effectiveGenModel);
  const providerNoRef = aiInfo && usesMaster && !aiInfo.capabilities.reference;
  const needLogin = aiInfo?.requiresAuth && !user;

  return (
    <div className="forge">
      <header className="forge-head">
        <Link href={STUDIO_PATH} className="btn-ghost"><ArrowLeft size={15} /> Studio</Link>
        <h1><Wand2 size={18} /> Sprite Forge</h1>
        <span className="muted small">Tạo sprite nhân vật đồng bộ: Master → Variant → Normalize → Pixel → Review</span>
        <div className="spacer" />
        <button className={`btn-ghost assistant-toggle ${assistantOpen ? "on" : ""}`} onClick={() => setAssistantOpen(!assistantOpen)} title="Trò chuyện với AI kèm hình">
          <Bot size={15} /> Trợ lý AI
        </button>
        <button
          className={`provider-pill ${!aiInfo ? "" : !aiInfo.configured ? "bad" : aiInfo.provider === "mock" ? "mock" : "ok"}`}
          onClick={() => openModal("aiSettings")}
          title="Cài đặt AI: provider, API key, model, hạn mức"
        >
          <span className="dot" />
          {aiInfo ? (
            <>
              <strong>{aiInfo.provider === "mock" ? "Mock" : aiInfo.model}</strong>
              <span>{aiInfo.configured ? `${aiInfo.usage.today}/${aiInfo.usage.limit} ảnh hôm nay` : "chưa có API key"}</span>
            </>
          ) : (
            <strong>{aiError ? "Server AI không kết nối" : "Đang kết nối…"}</strong>
          )}
          <Settings size={14} />
        </button>
      </header>

      <div className="forge-body">
        {/* ---------------- 1. setup ---------------- */}
        <section className="forge-col setup">
          <h3>1. Thiết lập</h3>
          <div className="mode-cards">
            <button className={`mode-card ${mode === "master" ? "active" : ""}`} onClick={() => { setMode("master"); setOutfit("BASE"); }}>
              <span className="mode-icon"><Crown size={16} /></span>
              <span className="mode-texts"><strong>Master mới</strong><span>Tạo nhân vật gốc</span></span>
            </button>
            <button className={`mode-card ${mode === "variant" ? "active" : ""}`} onClick={() => { setMode("variant"); if (outfit === "BASE") setOutfit("OUTFIT_A"); }}>
              <span className="mode-icon"><Shirt size={16} /></span>
              <span className="mode-texts"><strong>Variant</strong><span>Đổi trang phục từ master</span></span>
            </button>
            <button className={`mode-card ${mode === "animation" ? "active" : ""}`} onClick={() => setMode("animation")}>
              <span className="mode-icon"><Film size={16} /></span>
              <span className="mode-texts"><strong>Animation</strong><span>Động tác từ master</span></span>
            </button>
          </div>
          {regenFrom && <p className="note">Regenerate từ <b>{regenFrom.name}</b> (v{regenFrom.sprite?.version}). Bản cũ được giữ nguyên; sẽ lưu thành v{(regenFrom.sprite?.version ?? 1) + 1}.</p>}

          {usesMaster && (
            <>
              <label className="field-label">Master</label>
              <Select
                value={masterDoc?.id ?? ""}
                placeholder="- Chọn master -"
                options={masters.map((m) => ({
                  value: m.id,
                  label: m.name,
                  hint: `${m.sprite?.characterId} · ${m.sprite?.status === "approved" ? "Approved" : m.sprite?.status === "reviewed" ? "Reviewed" : "Draft"} · v${m.sprite?.version}`,
                  icon: Crown,
                }))}
                onChange={(id) => loadMaster(id)}
              />
              {!masters.length && <p className="muted small">Chưa có master nào. Tạo master trước.</p>}
              {masterDoc && (masterDoc.sprite?.dna?.traits ? (
                <p className="note dna-note" title={masterDoc.sprite.dna.traits}><Dna size={13} /> DNA được chèn vào prompt: <span className="clamp">{masterDoc.sprite.dna.traits}</span></p>
              ) : (
                <></>
              ))}
              {masterDoc && (!masterDoc.sprite?.dna?.traits || masterDoc.sprite?.status !== "approved") && (
                <div className="note warn master-todo">
                  <AlertTriangle size={13} />
                  <div>
                    <b>Nên hoàn tất master trước</b> (không bắt buộc — vẫn Generate được):
                    <ul>
                      {!masterDoc.sprite?.dna?.traits && <li>Chưa có <b>Character DNA</b> — giúp AI giữ đúng mặt, tóc, màu ở mọi {mode === "animation" ? "động tác" : "trang phục"}.</li>}
                      {masterDoc.sprite?.status !== "approved" && <li>Chưa <b>Approved</b> — duyệt để khóa bảng màu chuẩn và số liệu DNA.</li>}
                    </ul>
                    <button className="link-btn" onClick={() => router.push(`/studio/${encodeURIComponent(masterDoc.id)}`)}>Mở master → bấm chip &quot;Master · Draft&quot; để làm</button>
                  </div>
                </div>
              )}
              {mode === "variant" && reference && (
                <>
                  <label className="field-label">Mask vùng được đổi (tùy chọn, khuyến nghị)</label>
                  {!reference.fromSource && <p className="muted small">Master không có ảnh nguồn - dùng ảnh phóng to từ pixel làm tham chiếu.</p>}
                  <MaskPainter reference={reference.rgba} mask={mask} onChange={setMask} maxSize={300} />
                </>
              )}
            </>
          )}

          {mode === "animation" && (
            <div className="anim-setup">
              <div className="grid2">
                <div>
                  <label className="field-label">Động tác</label>
                  <Select<AnimationState>
                    value={animState}
                    onChange={setAnimState}
                    options={ANIMATION_STATES.filter((x) => x.value !== "custom").map((x) => ({ value: x.value, label: x.label, hint: ANIM_HINT[x.value] }))}
                  />
                </div>
                <div>
                  <label className="field-label">Số frame</label>
                  <div className="seg wide count-seg">
                    {([4, 6, 8] as const).map((n) => <button key={n} className={animFrames === n ? "active" : ""} onClick={() => setAnimFrames(n)}>{n}</button>)}
                  </div>
                </div>
              </div>
              <p className="muted small">AI vẽ 1 sprite sheet {animGrid[0]} cột × {animGrid[1]} hàng của chính nhân vật master. Sau đó tool tự mở <b>Cắt grid</b> để ghép thành animation. Nên Generate 1–2 phương án rồi chọn sheet đều nhất.</p>
            </div>
          )}

          <div className="grid2">
            <div>
              <label className="field-label">Tên nhân vật</label>
              <input className="text-input" value={displayName} placeholder="vd: Nam Kiếm Khách" disabled={usesMaster && !!masterDoc} onChange={(e) => { setDisplayName(e.target.value); if (!idTouched) setCharacterId(sanitizeId(e.target.value)); }} />
            </div>
            <div>
              <label className="field-label">Character ID</label>
              <input className="text-input" value={characterId} placeholder="tự sinh theo tên" disabled={usesMaster && !!masterDoc} onChange={(e) => { setCharacterId(e.target.value); setIdTouched(e.target.value.trim() !== ""); }} onBlur={(e) => setCharacterId(sanitizeId(e.target.value))} />
            </div>
          </div>
          {mode !== "animation" && (
            <>
              <label className="field-label">Outfit ID</label>
              <input className="text-input" value={outfit} onChange={(e) => setOutfit(e.target.value)} onBlur={(e) => setOutfit(sanitizeId(e.target.value))} />
            </>
          )}

          <div className="grid2">
            <div>
              <label className="field-label">Style preset</label>
              <Select
                value={presetId}
                disabled={usesMaster && !!masterDoc}
                options={SPRITE_PRESETS.map((p) => ({ value: p.id, label: `${p.id.replace(/_/g, " ")} · v${p.version}`, hint: p.name }))}
                onChange={(id) => { const p = getPreset(id)!; setPresetId(p.id); setCanvasW(p.canvas.width); setCanvasH(p.canvas.height); setAspect(detectAspect(p.canvas.width, p.canvas.height)); }}
              />
            </div>
            <div>
              <label className="field-label">Canvas</label>
              <div className={`size-field ${usesMaster && masterDoc ? "disabled" : ""}`}>
                <input type="number" min={16} max={512} value={canvasW} aria-label="Rộng" disabled={usesMaster && !!masterDoc} onChange={(e) => changeW(Number(e.target.value))} />
                <X size={12} className="muted" />
                <input type="number" min={16} max={512} value={canvasH} aria-label="Cao" disabled={usesMaster && !!masterDoc} onChange={(e) => changeH(Number(e.target.value))} />
                <span className="unit">px</span>
              </div>
            </div>
          </div>
          <div className="grid2">
            <div>
              <label className="field-label" title="Tỉ lệ rộng : cao của khung sprite. Sửa rộng thì cao tự đổi theo (và ngược lại).">Tỉ lệ khung</label>
              <Select
                value={aspect}
                disabled={usesMaster && !!masterDoc}
                onChange={chooseAspect}
                options={ASPECTS.map((a) => ({ value: a.id, label: a.label, hint: a.hint }))}
              />
            </div>
            <div>
              <label className="field-label" title="Các cỡ có sẵn theo tỉ lệ đang chọn">Cỡ nhanh</label>
              <Select
                value={`${canvasW}x${canvasH}`}
                disabled={usesMaster && !!masterDoc}
                placeholder={`${canvasW}×${canvasH}`}
                onChange={(v) => { const [w, h] = v.split("x").map(Number); setCanvasW(w); setCanvasH(h); }}
                options={SIZE_STEPS.map((hh) => {
                  const [w, h] = aspectDef.w ? fitAspect(canvasW, hh, aspect) : [Math.round((canvasW / canvasH) * hh), hh];
                  return { value: `${clampPx(w)}x${clampPx(h)}`, label: `${clampPx(w)} × ${clampPx(h)}`, hint: hh <= 96 ? "Nhỏ — NPC, quái thường" : hh <= 192 ? "Vừa — nhân vật chính" : "Lớn — boss, cutscene" };
                }).filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i)}
              />
            </div>
          </div>
          <div className="preset-facts">
            <span>Chân <b>{preset.footAnchor.x},{preset.footAnchor.y}</b></span>
            <span>Cao <b>{preset.contentHeight}px</b></span>
            <span>Tối đa <b>{basePreset.maxColors}</b> màu</span>
            {usesMaster && masterDoc && <span title="Variant / animation dùng cùng preset, canvas, góc nhìn và pose với master"><Lock size={11} /> theo master</span>}
          </div>

          <div className="grid2">
            <div>
              <label className="field-label">Góc nhìn</label>
              <Select value={view} disabled={usesMaster} options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} onChange={setView} />
            </div>
            <div>
              <label className="field-label">Pose</label>
              <Select value={pose} disabled={usesMaster} options={POSES.map((p) => ({ value: p.id, label: p.label, hint: p.hint }))} onChange={setPose} />
            </div>
          </div>

          <label className="field-label">
            Ảnh mẫu phong cách <span className="label-opt">tùy chọn · tối đa 3</span>
          </label>
          <div
            className="style-refs"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("over")}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("over"); addStyleFiles(e.dataTransfer.files); }}
          >
            {styleRefs.map((s) => (
              <div key={s.key} className="style-thumb checker" title={s.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={s.name} />
                <button className="style-remove" title="Bỏ ảnh mẫu này" onClick={() => setStyleRefs((prev) => prev.filter((x) => x.key !== s.key))}><X size={12} /></button>
              </div>
            ))}
            {styleRefs.length < 3 && (
              <label className="style-add" title="Thêm ảnh có nét vẽ bạn muốn AI bắt chước">
                <ImagePlus size={18} />
                <span>{styleRefs.length ? "Thêm" : "Thêm ảnh mẫu"}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { addStyleFiles(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
          <p className="muted small">
            {styleRefs.length
              ? `AI vẽ nhân vật MỚI theo nét vẽ / tô bóng / bảng màu của ${styleRefs.length} ảnh mẫu, không chép nhân vật trong ảnh.${mode === "variant" && styleRefs.some((s) => s.assetId) ? " (Đang dùng ảnh mẫu của master.)" : ""} Mỗi ảnh mẫu tốn thêm một ít tiền input.`
              : "Kéo thả 1–3 hình có phong cách bạn thích (sprite của bạn, concept art…). Nên dùng hình bạn có quyền sử dụng."}
          </p>
          {styleRefs.length > 0 && aiInfo && aiInfo.capabilities.styleReference === false && (
            <p className="note warn"><AlertTriangle size={13} /> Provider hiện tại không nhận ảnh mẫu — ảnh mẫu sẽ bị bỏ qua.</p>
          )}

          <div className="label-row">
            <label className="field-label" title="Viết bằng tiếng Anh cho kết quả tốt hơn">{mode === "variant" ? "Mô tả trang phục mới" : mode === "animation" ? "Ghi chú động tác (tùy chọn)" : "Mô tả nhân vật"}</label>
            <div className="label-actions">
              <label className={`chip-btn ${reading ? "busy" : ""}`} title={mode === "variant" ? "Tải hình trang phục bạn thích — AI viết mô tả trang phục" : "Tải hình nhân vật / concept — AI xem và viết mô tả"}>
                {reading ? <Spinner size={12} /> : <ScanEye size={13} />} Đọc ảnh
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={reading} onChange={(e) => { readImage(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button className={`chip-btn ${assistantOpen ? "on" : ""}`} onClick={() => setAssistantOpen(!assistantOpen)} title="Trò chuyện với AI kèm hình, như ChatGPT">
                <MessageSquare size={13} /> Hỏi AI
              </button>
            </div>
          </div>
          <textarea
            className="text-input"
            rows={4}
            value={prompt}
            placeholder={mode === "variant" ? "vd: white and blue scholar robe with silver belt" : mode === "animation" ? "vd: sword held low, robe and hair sway gently, slow breathing" : "vd: young male swordsman, red and black wuxia robe, long black hair in a topknot"}
            onChange={(e) => setPrompt(e.target.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const f = e.dataTransfer.files?.[0];
              if (f && f.type.startsWith("image/")) {
                e.preventDefault();
                e.stopPropagation();
                readImage(f);
              }
            }}
          />
          {mode !== "animation" && looksLikeMotion(prompt) && (
            <p className="note warn">
              <AlertTriangle size={13} /> Ô này có vẻ đang tả <b>động tác</b>. Chế độ {mode === "master" ? "Master" : "Variant"} chỉ vẽ 1 hình đứng — để ra bộ frame hãy dùng thẻ Animation, mỗi lần 1 động tác.
              <button className="link-btn" onClick={() => setMode("animation")}>Chuyển sang Animation</button>
            </p>
          )}
          <details className="small">
            <summary className="muted">Prompt cuối cùng gửi provider / negative prompt</summary>
            <pre className="prompt-pre">{finalPrompt}</pre>
            <label className="field-label">Negative prompt</label>
            <textarea className="text-input" rows={2} value={negative} onChange={(e) => setNegative(e.target.value)} />
          </details>

          <div className="grid2">
            <div>
              <label className="field-label" title="Số bản AI vẽ để bạn chọn 1 bản đẹp nhất — mỗi bản tính tiền riêng. Không phải số frame.">{mode === "animation" ? "Số sheet để chọn" : "Số bản để chọn"}</label>
              <div className="seg wide count-seg">
                {Array.from({ length: aiInfo?.limits.maxCount ?? 4 }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={count === n ? "active" : ""} onClick={() => setCount(n)}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label" title="Cùng seed + cùng prompt → cùng kết quả (nếu provider hỗ trợ)">Seed</label>
              {aiInfo && !aiInfo.capabilities.seed ? (
                <input key="seed-off" className="text-input" value="" readOnly disabled placeholder="Model không hỗ trợ" title="OpenAI không nhận seed — mỗi lần Generate cho kết quả khác" />
              ) : (
                <input key="seed-on" className="text-input" value={seed} placeholder="Ngẫu nhiên" inputMode="numeric" onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} />
              )}
            </div>
          </div>

          {providerNoRef && <p className="note warn"><AlertTriangle size={13} /> Provider hiện tại không dùng ảnh tham chiếu - kết quả KHÔNG được coi là variant giữ cấu trúc.</p>}
          {needLogin && <p className="note warn">Provider thật cần đăng nhập. <button className="link-btn" onClick={() => openModal("auth")}>Đăng nhập</button></p>}
          {aiError && <p className="note error">{aiError} <button className="link-btn" onClick={refreshAi}>thử lại</button></p>}
          {aiInfo && !aiInfo.configured && (
            <p className="note warn">
              <AlertTriangle size={13} /> Provider {aiInfo.provider} chưa có API key.
              <button className="link-btn" onClick={() => openModal("aiSettings")}>Mở Cài đặt AI</button>
            </p>
          )}

          {imageModels.length > 0 && (
            <div className="gen-options">
              <div>
                <label className="field-label">Model tạo ảnh</label>
                <Select
                  value={effectiveGenModel ?? ""}
                  onChange={setGenModel}
                  options={imageModels.map((m) => ({ value: m.id, label: m.id.replace(/^gpt-image-/, ""), hint: `${m.hint}${m.id === aiInfo?.model ? " · mặc định" : ""}` }))}
                />
              </div>
              <div>
                <label className="field-label">Chất lượng</label>
                <Select
                  value={effectiveGenQuality ?? ""}
                  onChange={setGenQuality}
                  options={(aiInfo?.qualities ?? []).map((q) => ({
                    value: q,
                    label: q === "low" ? "Low" : q === "medium" ? "Medium" : q === "high" ? "High" : "Auto",
                    hint: q === "low" ? "Rẻ nhất — để thử prompt" : q === "medium" ? "Cân bằng" : q === "high" ? "Đẹp nhất, đắt hơn" : "Provider tự chọn",
                  }))}
                />
              </div>
            </div>
          )}
          {maskRisk && <p className="note warn"><AlertTriangle size={13} /> Model 2.6 chưa được xác nhận hỗ trợ mask — nên dùng 2.5-sunburst khi tạo variant.</p>}
          <div className="forge-actions">
            {busy ? (
              <button className="gen-btn busy" onClick={() => abortRef.current?.abort()}>
                <Spinner size={16} />
                <span className="gen-texts"><strong>{mode === "animation" ? `Đang vẽ ${count} sheet × ${animFrames} frame…` : `Đang tạo ${count} bản…`}</strong><span>Bấm để hủy</span></span>
              </button>
            ) : (
              <button className="gen-btn" disabled={!aiInfo || !aiInfo.configured || !!needLogin || (usesMaster && !reference)} onClick={generate}>
                <Sparkles size={18} />
                <span className="gen-texts">
                  <strong>{mode === "animation" ? `Generate ${count} sheet × ${animFrames} frame` : `Generate ${count} bản để chọn`}</strong>
                  <span>
                    {aiInfo
                      ? `${aiInfo.provider === "mock" ? "Mock - miễn phí" : `${effectiveGenModel ?? aiInfo.model}${effectiveGenQuality ? ` · ${effectiveGenQuality}` : ""}`}${aiInfo.limits.costPerImageUsd ? ` · ước tính ~$${(count * aiInfo.limits.costPerImageUsd).toFixed(2)}` : ""}`
                      : "Đang kết nối server…"}
                  </span>
                </span>
              </button>
            )}
            <div className="or-divider"><span>hoặc</span></div>
            <label
              className="import-drop"
              title="Dùng ảnh có sẵn (vẽ tay, AI khác…) thay vì generate"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("over")}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("over"); importFiles(e.dataTransfer.files); }}
            >
              <ImageUp size={18} />
              <span className="gen-texts"><strong>Nhập ảnh có sẵn</strong><span>Kéo thả hoặc bấm chọn · PNG / JPG / WebP · tối đa 4</span></span>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </section>

        {/* ---------------- 2. candidates + cleanup ---------------- */}
        <section className="forge-col candidates">
          <h3>
            2. Chọn phương án & xóa nền
            {candidates.length > 0 && (
              <span className="h3-actions">
                <span className="muted small">{candidates.length} ảnh</span>
                {candidates.length > 1 && selectedId && (
                  <button className="chip-btn" title="Chỉ giữ ảnh đang chọn" onClick={() => removeCandidates(candidates.filter((c) => c.id !== selectedId).map((c) => c.id))}>
                    Giữ ảnh đang chọn
                  </button>
                )}
                <button className="chip-btn danger" title="Xóa tất cả phương án (ảnh đã lưu vào sprite không bị ảnh hưởng)" onClick={() => confirm(`Xóa ${candidates.length} phương án?`) && removeCandidates(candidates.map((c) => c.id))}>
                  <Trash2 size={12} /> Xóa hết
                </button>
              </span>
            )}
          </h3>
          {gen && gen.warnings.length > 0 && <ul className="note warn list">{gen.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {gen && usesMaster && <p className="muted small">Reference: {gen.referenceUsed ? "đã dùng" : "KHÔNG dùng"} · Mask: {gen.maskUsed ? "đã dùng" : "không"} · Model: {gen.model}</p>}
          {candidates.length === 0 ? (
            <div className="empty small">Chưa có phương án. Bấm Generate hoặc Nhập ảnh.</div>
          ) : (
            <div className="cand-grid">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className={`cand ${c.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedId(c.id);
                    if (e.key === "Delete") removeCandidates([c.id]);
                  }}
                  title={c.name ?? (c.seed != null ? `seed ${c.seed}` : "")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt="" className="checker" />
                  <span className="chip">{c.origin === "ai" ? (c.seed != null ? `seed ${c.seed}` : "AI") : "nhập"}</span>
                  <button
                    className="cand-remove"
                    title="Xóa phương án này (phím Delete)"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCandidates([c.id]);
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selected && mode === "animation" && (
            <button className="btn-primary big anim-cut-btn" onClick={() => setSlicerFor(selected)}>
              <Film size={15} /> Cắt sheet & tạo animation {ANIMATION_STATES.find((x) => x.value === animState)?.label}
            </button>
          )}
          {selected && (
            <>
              <div className="toolbar-row">
                <div className="seg">
                  <button className={srcView === "cleaned" ? "active" : ""} onClick={() => setSrcView("cleaned")}>Đã xóa nền</button>
                  <button className={srcView === "mask" ? "active" : ""} onClick={() => setSrcView("mask")}>Alpha mask</button>
                  <button className={srcView === "original" ? "active" : ""} onClick={() => setSrcView("original")}>Gốc</button>
                </div>
                <span className="muted small">{selected.rgba.width}×{selected.rgba.height}</span>
                <button className="chip-btn" style={{ marginLeft: "auto" }} onClick={() => setSlicerFor(selected)} title="Cắt sprite sheet thành từng ô: chọn 1 ô làm phương án, hoặc ghép nhiều ô thành animation">
                  <Grid3x3 size={13} /> Cắt grid
                </button>
              </div>
              {(quality?.stats.components ?? 0) >= 8 && (
                <p className="note warn">
                  <AlertTriangle size={13} /> Ảnh có {quality?.stats.components} mảng rời — giống một sprite sheet nhiều nhân vật.
                  <button className="link-btn" onClick={() => setSlicerFor(selected)}>Cắt grid</button>
                </p>
              )}
              <div className="src-stage">
                <RgbaPreview image={srcImage} maxSize={340} />
              </div>
              <label className="check-row">
                <input type="checkbox" checked={cleanup.enabled} onChange={(e) => setCleanup({ ...cleanup, enabled: e.target.checked })} /> Xóa nền
                {bgGuess && (bgGuess.alreadyTransparent ? <span className="muted small"> - ảnh đã trong suốt</span> : <span className="muted small"> - nền phát hiện <span className="swatch" style={{ background: bgGuess.color ?? "" }} /> {bgGuess.color} ({Math.round(bgGuess.confidence * 100)}% viền)</span>)}
              </label>
              {cleanup.enabled && (
                <>
                  <div className="seg wide">
                    <button className={cleanup.mode === "edge" ? "active" : ""} onClick={() => setCleanup({ ...cleanup, mode: "edge" })} title="Chỉ xóa nền nối với mép ảnh - giữ vùng trắng bên trong (mắt, áo trắng)">Từ mép (an toàn)</button>
                    <button className={cleanup.mode === "global" ? "active" : ""} onClick={() => setCleanup({ ...cleanup, mode: "global" })} title="Xóa mọi pixel cùng màu nền, kể cả vùng kín">Toàn ảnh</button>
                  </div>
                  <label className="field-label">Ngưỡng màu nền: {cleanup.tolerance}</label>
                  <input type="range" min={0} max={160} value={cleanup.tolerance} onChange={(e) => setCleanup({ ...cleanup, tolerance: Number(e.target.value) })} />
                  <div className="grid2">
                    <div>
                      <label className="field-label" title="Số lượt gọt bỏ viền sáng (halo) quanh nhân vật">Gọt halo: {cleanup.haloPasses} lượt</label>
                      <input type="range" min={0} max={6} value={cleanup.haloPasses} onChange={(e) => setCleanup({ ...cleanup, haloPasses: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="field-label" title="Pixel viền gần màu nền hơn ngưỡng này sẽ bị gọt">Ngưỡng halo: {cleanup.haloTolerance}</label>
                      <input type="range" min={0} max={250} value={cleanup.haloTolerance} onChange={(e) => setCleanup({ ...cleanup, haloTolerance: Number(e.target.value) })} />
                    </div>
                  </div>
                  {result && <p className="muted small">Đã xóa {result.cleanup.removedCount.toLocaleString()} px nền + {result.cleanup.haloRemoved.toLocaleString()} px halo. Ảnh gốc không bị sửa.</p>}
                </>
              )}
            </>
          )}
        </section>

        {/* ---------------- 3. pixel + review ---------------- */}
        <section className="forge-col review">
          <h3>3. Normalize, pixel hóa & kiểm tra {processing && <Spinner size={13} />}</h3>
          {mode === "animation" ? (
            <div className="anim-hint">
              <Film size={28} />
              <strong>Chế độ Animation</strong>
              <ol>
                <li>Chọn <b>master</b>, <b>động tác</b> và <b>số frame</b> ở cột 1.</li>
                <li>Bấm <b>Generate</b> — AI vẽ một sprite sheet của chính nhân vật đó.</li>
                <li>Hộp <b>Cắt sprite sheet</b> tự mở: kiểm tra từng ô, xem thử, chỉnh FPS.</li>
                <li>Bấm <b>Tạo animation & mở Editor</b> → Timeline có sẵn nhãn trạng thái; dùng <b>Căn chân</b>, <b>Ghost Master</b>, <b>Xem trong game</b> để sửa.</li>
              </ol>
              <p className="muted small">AI không vẽ các frame giống nhau tuyệt đối — luôn duyệt bằng mắt và sửa pixel trong Editor.</p>
            </div>
          ) : !selected || !result ? (
            <div className="empty small">Chọn một phương án để xem kết quả.</div>
          ) : (
            <>
              <div className="toolbar-row">
                <ZoomPicker value={zoom} onChange={setZoom} />
                <BgPicker value={bg} onChange={setBg} />
                {mode === "variant" && masterFlat && (
                  <button className={`btn-ghost sm ${overlayOn ? "on" : ""}`} onClick={() => setOverlayOn(!overlayOn)} title="Chồng silhouette master (hồng)">
                    {overlayOn ? <Eye size={13} /> : <EyeOff size={13} />} Overlay master
                  </button>
                )}
              </div>
              <div className="pv-stage">
                <PixelPreview
                  width={preset.canvas.width}
                  height={preset.canvas.height}
                  pixels={result.pixels}
                  zoom={zoom}
                  bg={bg}
                  overlay={mode === "variant" && overlayOn ? masterFlat?.pixels : null}
                  anchor={preset.footAnchor}
                />
                {zoom !== 1 && (
                  <div className="pv-1x">
                    <span className="muted small">1×</span>
                    <PixelPreview width={preset.canvas.width} height={preset.canvas.height} pixels={result.pixels} zoom={1} bg={bg} />
                  </div>
                )}
              </div>

              <div className="grid2">
                <div>
                  <label className="field-label">Bảng màu</label>
                  <Select<PixelConfig["paletteMode"]>
                    value={pixel.paletteMode}
                    onChange={(v) => setPixel({ ...pixel, paletteMode: v })}
                    options={[
                      { value: "auto", label: "Tự động", hint: "Median cut" },
                      ...(basePreset.paletteId ? [{ value: "preset" as const, label: "Palette preset", hint: basePreset.paletteId }] : []),
                      ...(masterDoc
                        ? [
                          { value: "master-snap" as const, label: "Màu master + màu mới", hint: "Giữ da/tóc/viền, cho phép outfit mới" },
                          { value: "master" as const, label: "Chỉ palette master", hint: `${masterPalette?.length ?? 0} màu, nghiêm ngặt` },
                        ]
                        : []),
                    ]}
                  />
                </div>
                <div>
                  <label className="field-label">Resize</label>
                  <Select<PixelConfig["resizeMethod"]>
                    value={pixel.resizeMethod}
                    onChange={(v) => setPixel({ ...pixel, resizeMethod: v })}
                    options={[
                      { value: "box", label: "Box", hint: "Lấy trung bình - hợp ảnh AI" },
                      { value: "nearest", label: "Nearest", hint: "Giữ cạnh cứng - hợp ảnh pixel sẵn" },
                    ]}
                  />
                </div>
              </div>
              {pixel.paletteMode === "master-snap" && (
                <>
                  <label className="field-label">Khoảng hút về màu master: {pixel.snapDistance ?? 28}</label>
                  <input type="range" min={0} max={90} value={pixel.snapDistance ?? 28} onChange={(e) => setPixel({ ...pixel, snapDistance: Number(e.target.value) })} />
                  <p className="muted small">Màu gần màu master (da, tóc, viền) được thay bằng đúng màu master; màu trang phục mới được giữ.</p>
                </>
              )}
              {(pixel.paletteMode === "auto" || pixel.paletteMode === "master-snap") && (
                <>
                  <label className="field-label">Số màu tối đa: {pixel.maxColors}</label>
                  <input type="range" min={4} max={64} value={pixel.maxColors} onChange={(e) => setPixel({ ...pixel, maxColors: Number(e.target.value) })} />
                </>
              )}
              <label className="field-label">Ngưỡng alpha: {pixel.alphaThreshold}</label>
              <input type="range" min={1} max={255} value={pixel.alphaThreshold} onChange={(e) => setPixel({ ...pixel, alphaThreshold: Number(e.target.value) })} />
              {mode === "variant" && masterDoc?.sprite?.normalize && (
                <label className="check-row">
                  <input type="checkbox" checked={scaleMode === "match-master"} onChange={(e) => setScaleMode(e.target.checked ? "match-master" : "fit-height")} /> Dùng tỉ lệ của master (giữ kích thước cơ thể)
                </label>
              )}
              {result.normalize && (
                <p className="muted small">
                  Scale {result.normalize.scale.toFixed(4)} · nội dung {result.normalize.contentWidth}×{result.normalize.contentHeight} · offset ({result.normalize.offsetX}, {result.normalize.offsetY}) · {result.palette.length} màu
                </p>
              )}

              {dnaCmp && <DnaCompareCard c={dnaCmp} />}
              <h4>Kiểm tra tự động</h4>
              <QualityList issues={quality?.issues ?? []} extraWarnings={result.warnings} />

              <button className="btn-primary big" disabled={saving || !result.bbox} onClick={save}>
                {saving ? <Spinner size={15} /> : <Save size={15} />} Lưu Draft & mở trong Editor
              </button>
              <p className="muted small">
                <Layers size={12} /> Lưu: ảnh nguồn gốc (không sửa), ảnh đã xóa nền{mask ? ", mask" : ""}, prompt/seed/provider, cấu hình pixel & căn chỉnh.
                {!user && " Chưa đăng nhập → asset chỉ lưu trên trình duyệt này."}
              </p>
              <button className="btn-ghost sm" onClick={() => setResult(runSpritePipeline(selected.rgba, { preset, cleanup, pixel: { ...pixel, palette: effectivePalette }, scaleOverride: masterScale, snapPalette }))}>
                <RefreshCw size={13} /> Chạy lại pipeline
              </button>
            </>
          )}
        </section>
      </div>
      {slicerFor && (
        <SheetSlicerModal
          image={slicerFor.rgba}
          name={displayName.trim() || "Sprite"}
          preset={preset}
          cleanup={cleanup}
          maxColors={pixel.maxColors}
          alphaThreshold={pixel.alphaThreshold}
          resizeMethod={pixel.resizeMethod}
          palette={effectivePalette ?? (snapPalette ? snapPalette.colors : null)}
          initial={mode === "animation" ? { state: animState, frames: animFrames, cols: animGrid[0], rows: animGrid[1] } : undefined}
          masterRef={usesMaster ? masterDoc?.id ?? null : null}
          onClose={() => setSlicerFor(null)}
          onAddCandidates={async (cells) => {
            const list: Candidate[] = [];
            for (const [i, c] of cells.entries()) {
              const blob = await rgbaToPng(c.rgba);
              list.push({ id: `cut${Date.now().toString(36)}${i}`, blob, rgba: c.rgba, url: URL.createObjectURL(blob), seed: null, origin: "import", name: `${slicerFor.name ?? "sheet"} · ${c.label}` });
            }
            addCandidates(list);
            setSlicerFor(null);
            notify(`Đã thêm ${list.length} ô vào phương án`, "success");
          }}
          onCreateAnimation={async (doc) => {
            setSlicerFor(null);
            await openDocument(doc);
            notify(`Đã tạo animation ${doc.frames.length} frame — bấm Enter trong Editor để phát`, "success");
          }}
        />
      )}
      <AiAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onInsertPrompt={setPrompt}
        context={{ mode, characterName: displayName, prompt }}
        getSelectedImage={() => selected?.blob ?? null}
        visionLabel={aiInfo?.vision ? (aiInfo.vision.mode === "openai" ? `Đọc ảnh & chat · ${aiInfo.vision.model}` : "Mock — bật OpenAI để trả lời thật") : "Đang kết nối…"}
      />
    </div>
  );
}
