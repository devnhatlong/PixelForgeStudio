import type { PixelDocument } from "@/types/editor";
import { createDocument, createFrame } from "./document";

const CAT_COLORS: Record<string, string> = {
  k: "#1a1214",
  b: "#3d2317",
  o: "#d97724",
  y: "#f0a848",
  w: "#ffffff",
  p: "#f08aa0",
  g: "#3fa35c",
  l: "#9ee68c",
};

// 24 x 24 body (no tail)
const CAT_BODY = [
  "........................",
  "........................",
  "....kk........kk........",
  "...kppk......kppk.......",
  "...kpook....koopk.......",
  "...koooookkoooook.......",
  "..koooobooooboooook.....",
  "..koobooooooooobook.....",
  "..koogloookkoooglook....",
  "..koogloookpkooglook....",
  "..kooooooowkwooooook....",
  "..kooooooowwwooooook....",
  "...kooooowwwwwooooook...",
  "...kboooowwwwwoooobk....",
  "....kooobwwwwwbooook....",
  "....koooowwwwwooooook...",
  "....kboooowwwoooobook...",
  "....kooooooooooooook....",
  "....kbooooooooooobok....",
  "....koooooooooooooook...",
  "....kkoooooooooooookk...",
  ".....kwwkooooookwwk.....",
  ".....kkkkkkkkkkkkkk.....",
  "........................",
];

// 5 x 10 tail sprites anchored at (19, 12)
const CAT_TAILS = [
  [".....", ".....", ".....", ".....", "ko...", "ko...", ".ko..", ".ko..", ".ko..", ".kk.."],
  [".....", ".....", ".....", ".....", "ko...", ".ko..", "..ko.", "..ko.", "..kk.", "....."],
  [".....", ".....", ".....", "ko...", ".koo.", "..kok", "...kk", ".....", ".....", "....."],
  [".....", "...k.", "..kok", ".kok.", "koo..", "kk...", ".....", ".....", ".....", "....."],
  [".....", ".....", ".....", "ko...", ".koo.", "..kok", "...kk", ".....", ".....", "....."],
];

const TAIL_X = 19;
const TAIL_Y = 12;

export function buildCatTemplate(name = "Chú Mèo Vẫy Đuôi"): PixelDocument {
  const doc = createDocument(name, 24, 24);
  doc.layers[0].name = "Cat Sprite";
  doc.frames = [];
  const layerId = doc.layers[0].id;

  for (const tail of CAT_TAILS) {
    const frame = createFrame(doc, 160);
    const px = frame.cels[layerId];
    for (let y = 0; y < 24; y++) {
      const row = CAT_BODY[y].padEnd(24, ".");
      for (let x = 0; x < 24; x++) {
        const ch = row[x];
        if (ch !== ".") px[y * 24 + x] = CAT_COLORS[ch] ?? "";
      }
    }
    for (let ty = 0; ty < tail.length; ty++) {
      for (let tx = 0; tx < tail[ty].length; tx++) {
        const ch = tail[ty][tx];
        if (ch === ".") continue;
        const x = TAIL_X + tx;
        const y = TAIL_Y + ty;
        if (x >= 24 || y >= 24) continue;
        const i = y * 24 + x;
        if (!px[i]) px[i] = CAT_COLORS[ch];
      }
    }
    doc.frames.push(frame);
  }
  doc.palette = Object.values(CAT_COLORS);
  return doc;
}

export interface SizePreset {
  size: number;
  label: string;
  desc: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { size: 16, label: "16 x 16", desc: "Biểu tượng, icon, item mini cổ điển" },
  { size: 24, label: "24 x 24", desc: "Nhân vật RPG retro (như mẫu Con Mèo 5-frame)" },
  { size: 32, label: "32 x 32", desc: "Chuẩn pixel art phổ biến nhất (indie game)" },
  { size: 48, label: "48 x 48", desc: "Sprite hành động & chi tiết cao" },
  { size: 64, label: "64 x 64", desc: "Boss, vũ khí lớn hoặc ảnh chân dung portrait" },
  { size: 96, label: "96 x 96", desc: "Tranh minh họa pixel art giàu chi tiết" },
  { size: 128, label: "128 x 128", desc: "Khung cảnh, tilemap lớn hoặc artwork" },
  { size: 192, label: "192 x 192", desc: "Một bức ảnh lớn" },
];
