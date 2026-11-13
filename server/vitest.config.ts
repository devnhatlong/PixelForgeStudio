import { defineConfig } from "vitest/config";

export default defineConfig({
  // never load the real server/.env (it holds the API key) during tests
  test: { include: ["test/**/*.spec.ts"], env: { PF_ENV_FILE: "__no_env_file_in_tests__" } },
});
