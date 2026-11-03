import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  build: {
    target: "esnext", minify: false,
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, "index.html"), background: resolve(import.meta.dirname, "src/background.ts") },
      output: { entryFileNames: chunk => chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js" },
    },
  },
});
