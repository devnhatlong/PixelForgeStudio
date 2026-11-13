/** Pure helpers to update KEY=value lines of a .env file while keeping comments, order and unrelated lines. */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export function formatEnvValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("Giá trị không được chứa xuống dòng");
  // quote when the value has spaces, '#', quotes or leading/trailing whitespace
  if (value === "" || /^[A-Za-z0-9_.:\/@+\-=,]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Replace the value of each key (first active occurrence) or append it at the end.
 * Commented lines (# KEY=...) are left untouched.
 */
export function updateEnvText(text: string, updates: Record<string, string>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length ? text.split(/\r?\n/) : [];
  const done = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    if (key in updates && !done.has(key)) {
      lines[i] = `${key}=${formatEnvValue(updates[key])}`;
      done.add(key);
    }
  }
  const missing = Object.keys(updates).filter((k) => !done.has(k));
  if (missing.length) {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    for (const k of missing) {
      if (!KEY_RE.test(k)) throw new Error(`Tên biến không hợp lệ: ${k}`);
      lines.push(`${k}=${formatEnvValue(updates[k])}`);
    }
  }
  let out = lines.join(eol);
  if (!out.endsWith(eol)) out += eol;
  return out;
}

/** "sk-proj-abc...xyz" → "sk-…xyz9" (never return the full key to the browser). */
export function maskKey(key: string | undefined | null): string | null {
  if (!key) return null;
  const k = key.trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

export function isLoopback(addr: string | undefined | null): boolean {
  if (!addr) return false;
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1" || addr.startsWith("127.");
}
