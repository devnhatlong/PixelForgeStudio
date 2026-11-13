import { describe, expect, it } from "vitest";
import { splitPromptBlocks } from "@/lib/sprite/ai-client";

describe("splitPromptBlocks", () => {
  it("separates text and ```prompt blocks", () => {
    const t = "Gợi ý:\n```prompt\nblue scholar robe\n```\nHoặc:\n```prompt\r\nred armor\r\n```";
    expect(splitPromptBlocks(t)).toEqual([
      { type: "text", value: "Gợi ý:\n" },
      { type: "prompt", value: "blue scholar robe" },
      { type: "text", value: "\nHoặc:\n" },
      { type: "prompt", value: "red armor" },
    ]);
  });
  it("plain text stays plain", () => {
    expect(splitPromptBlocks("chỉ là chữ")).toEqual([{ type: "text", value: "chỉ là chữ" }]);
  });
});
