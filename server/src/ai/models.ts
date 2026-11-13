/** Model catalogue shared by settings, /ai/info and request validation (no Nest imports → no cycles). */

export const DEFAULT_OPENAI_MODEL = "gpt-image-2.5-sunburst";

export const OPENAI_MODEL_SUGGESTIONS = [
  { id: "gpt-image-2.5-sunburst", hint: "Chi tiết, edit chính xác (khuyên dùng)" },
  { id: "gpt-image-2.5-flare", hint: "Nhanh / rẻ hơn" },
  { id: "gpt-image-2.6-sunburst", hint: "Mới hơn — mask chưa được xác nhận" },
  { id: "gpt-image-2.6-flare", hint: "Mới hơn, nhanh — mask chưa được xác nhận" },
  { id: "gpt-image-2", hint: "Thế hệ trước" },
];

export const IMAGE_QUALITIES = ["low", "medium", "high", "auto", "xhigh", "max"];

export const MODEL_ID_RE = /^[A-Za-z0-9._:\-]{2,80}$/;
