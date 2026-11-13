import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { extractOutputText, mockDescribe, toResponsesInput, validateChat } from "../src/ai/vision";

const png = (rgba: [number, number, number, number]) => {
  const p = new PNG({ width: 4, height: 4 });
  for (let i = 0; i < 16; i++) p.data.set(rgba, i * 4);
  return PNG.sync.write(p);
};
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

describe("validateChat", () => {
  it("accepts user text + image and drops empty messages", () => {
    const r = validateChat([{ role: "assistant", text: "" }, { role: "user", text: "xem hình", images: [dataUrl(png([200, 0, 0, 255]))] }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(1);
  });
  it("rejects fake images, bad roles, assistant-last, and too many images", () => {
    expect(validateChat([{ role: "user", text: "x", images: ["data:image/png;base64,AAAA"] }]).ok).toBe(false);
    expect(validateChat([{ role: "system" as "user", text: "x" }]).ok).toBe(false);
    expect(validateChat([{ role: "user", text: "a" }, { role: "assistant", text: "b" }]).ok).toBe(false);
    const img = dataUrl(png([0, 0, 0, 255]));
    expect(validateChat([{ role: "user", text: "x", images: Array(7).fill(img) }]).ok).toBe(false);
    expect(validateChat([]).ok).toBe(false);
  });
});

describe("Responses API mapping", () => {
  it("builds input parts and reads output text", () => {
    const input = toResponsesInput([
      { role: "user", text: "hi", images: ["data:image/png;base64,QQ=="] },
      { role: "assistant", text: "hello" },
    ]);
    expect(input[0]).toEqual({ role: "user", content: [{ type: "input_text", text: "hi" }, { type: "input_image", image_url: "data:image/png;base64,QQ==", detail: "auto" }] });
    expect(input[1]).toEqual({ role: "assistant", content: "hello" });
    expect(extractOutputText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "A" }, { type: "output_text", text: "B" }] }] })).toBe("A\nB");
    expect(extractOutputText({ output_text: "direct" })).toBe("direct");
  });
  it("mock describe reflects the image colour", () => {
    expect(mockDescribe(png([30, 80, 220, 255]), "outfit")).toContain("blue");
    expect(mockDescribe(png([220, 30, 30, 255]), "character")).toContain("red");
  });
});

describe("cleanDescribeText", () => {
  it("keeps only the fenced prompt / strips quotes", async () => {
    const { cleanDescribeText } = await import("../src/ai/vision");
    expect(cleanDescribeText("Here:\n```prompt\nwhite robe\n```\nthanks")).toBe("white robe");
    expect(cleanDescribeText('"red armor"')).toBe("red armor");
  });
});
