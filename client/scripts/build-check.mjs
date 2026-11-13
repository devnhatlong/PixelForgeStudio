// Production build into .next-check so it can run while `npm run dev` is using .next.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: ".next-check" },
});
process.exit(r.status ?? 1);
