import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Vitest runs the pure simulation systems (src/systems/**) in a plain Node
// environment. The `@` alias mirrors tsconfig/vite so tests import systems the
// same way application code does.
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
