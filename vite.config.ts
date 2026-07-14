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
    // No dynamic imports → no need for Vite's module-preload polyfill, which
    // would otherwise inject a `fetch(` call. The game makes zero network
    // requests at runtime (the AI is fully local); keeping the bundle
    // fetch-free is an enforced invariant.
    modulePreload: { polyfill: false },
  },
});
