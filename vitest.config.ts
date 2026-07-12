import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Vitest reuses the app's `@` path alias so tests import sim modules the same
 * way the app does. The sim is pure functions, so tests need no DOM env.
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
