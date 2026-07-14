import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Test configuration. The systems under test are pure (no DOM), so a plain
 * `node` environment is enough — the renderer/HUD are exercised in the browser,
 * not here. Shares the `@/` alias with the app build.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
