import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Same `@/*` alias as tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next resolves this marker itself; tests run outside Next, so they get its empty module.
      "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".open-next/**", ".git/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
