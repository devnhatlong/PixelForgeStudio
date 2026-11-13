/** Extract the list-view fields of data.sprite (see client types/sprite.ts SpriteSummary). */
export function spriteSummary(data: Record<string, unknown>): Record<string, unknown> | null {
  const s = data?.sprite as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") return null;
  const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : null);
  return {
    kind: s.kind === "variant" ? "variant" : "master",
    characterId: str(s.characterId) ?? "",
    masterId: str(s.masterId),
    outfit: str(s.outfit) ?? "",
    status: ["draft", "reviewed", "approved"].includes(s.status as string) ? s.status : "draft",
    version: Number(s.version) || 1,
    presetId: str(s.presetId) ?? "",
  };
}
