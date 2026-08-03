import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
    // Rotas de escrita rodam em Node: tocam a rede e não precisam de DOM.
    environmentMatchGlobs: [
      ["test/write.test.ts", "node"],
      ["test/chain.test.ts", "node"],
      ["test/assinatura-fundador.test.ts", "node"],
      ["test/claim-kyb.test.ts", "node"],
      ["test/admin.test.ts", "node"],
      ["test/patrocinio.test.ts", "node"],
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Ver test/stubs/server-only.ts.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
});
