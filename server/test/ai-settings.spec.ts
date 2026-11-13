import { describe, expect, it } from "vitest";
import { formatEnvValue, isLoopback, maskKey, updateEnvText } from "../src/ai/env-file";
import { settingsToEnv } from "../src/ai/ai-settings";

describe("updateEnvText", () => {
  const src = "# comment\nPORT=4000\n# OPENAI_API_KEY=old-commented\nOPENAI_API_KEY=\nAI_PROVIDER=mock\n";
  it("replaces values in place and keeps comments/order", () => {
    const out = updateEnvText(src, { OPENAI_API_KEY: "sk-abc", AI_PROVIDER: "openai" });
    expect(out).toBe("# comment\nPORT=4000\n# OPENAI_API_KEY=old-commented\nOPENAI_API_KEY=sk-abc\nAI_PROVIDER=openai\n");
  });
  it("appends missing keys and preserves CRLF", () => {
    const out = updateEnvText("A=1\r\n", { B: "2" });
    expect(out).toBe("A=1\r\nB=2\r\n");
  });
  it("quotes values with spaces and rejects newlines", () => {
    expect(formatEnvValue("a b#c")).toBe('"a b#c"');
    expect(formatEnvValue("sk-proj_ABC-123")).toBe("sk-proj_ABC-123");
    expect(() => formatEnvValue("x\nEVIL=1")).toThrow();
  });
  it("works on an empty file", () => {
    expect(updateEnvText("", { AI_PROVIDER: "openai" })).toBe("AI_PROVIDER=openai\n");
  });
});

describe("settingsToEnv", () => {
  it("maps a valid body", () => {
    expect(settingsToEnv({ provider: "openai", apiKey: " sk-proj-abcdefghijklmnopqrstuvwxyz0123 ", model: "gpt-image-2.5-flare", quality: "high", background: "transparent", dailyLimit: 20, maxCandidates: 3, costPerImageUsd: 0.04 })).toEqual({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwxyz0123",
      OPENAI_IMAGE_MODEL: "gpt-image-2.5-flare",
      OPENAI_IMAGE_QUALITY: "high",
      OPENAI_IMAGE_BACKGROUND: "transparent",
      AI_DAILY_IMAGE_LIMIT: "20",
      AI_MAX_CANDIDATES: "3",
      AI_COST_PER_IMAGE_USD: "0.04",
    });
  });
  it("blank apiKey keeps the stored key; clearKey removes it", () => {
    expect(settingsToEnv({ apiKey: "  " })).toEqual({});
    expect(settingsToEnv({ clearKey: true, apiKey: "sk-whatever-long-enough-123" })).toEqual({ OPENAI_API_KEY: "" });
  });
  it("rejects bad input (incl. injection attempts)", () => {
    expect(() => settingsToEnv({ provider: "evil" })).toThrow();
    expect(() => settingsToEnv({ apiKey: "sk-abc\nAI_PROVIDER=mock" })).toThrow();
    expect(() => settingsToEnv({ apiKey: "short" })).toThrow();
    expect(() => settingsToEnv({ model: "../../etc" })).toThrow();
    expect(() => settingsToEnv({ dailyLimit: 0 })).toThrow();
    expect(() => settingsToEnv({ maxCandidates: 9 })).toThrow();
  });
});

describe("helpers", () => {
  it("maskKey never reveals the key", () => {
    expect(maskKey("sk-proj-abcdefghijklmnop1234")).toBe("sk-…1234");
    expect(maskKey("")).toBeNull();
  });
  it("isLoopback", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.1.5")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});
