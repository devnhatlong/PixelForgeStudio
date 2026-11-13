/**
 * Load server/.env BEFORE any other module is imported: some modules (auth) read process.env at import time.
 * Existing environment variables win over the file. Must be the first import in main.ts.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";

/** The server folder = nearest ancestor whose package.json is "pixelforge-server" (independent of dist/ layout). */
function findServerRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).name === "pixelforge-server") return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(start, ".."); // fallback: old behaviour
    dir = parent;
  }
}

export const SERVER_ROOT = findServerRoot(__dirname);
export const ENV_FILE = process.env.PF_ENV_FILE ?? join(SERVER_ROOT, ".env");

if (existsSync(ENV_FILE)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: ENV_FILE, quiet: true });
}
