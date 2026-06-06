import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws when imported outside a React Server Component.
      // Stub it so server libs can be unit-tested in the Node test environment.
      "server-only": path.resolve(__dirname, "src/test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.ts"],
  },
});
