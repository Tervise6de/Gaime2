import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    // The game is a single self-contained bundle with no runtime dependencies
    // and makes no network calls. Disable Vite's module-preload polyfill so the
    // built output contains no fetch() at all — nothing to preload, nothing to
    // phone home. (The rival AI is 100% local; see docs/game-design.md §5.)
    modulePreload: { polyfill: false },
  },
});
