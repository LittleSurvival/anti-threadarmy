import { build, defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const releasePath = resolve(import.meta.dirname, "../../manifest.json");
const templatePath = resolve(import.meta.dirname, "manifest.template.json");

export default defineConfig({
  plugins: [
    {
      name: "extension-manifest",
      buildStart() {
        this.addWatchFile(releasePath);
        this.addWatchFile(templatePath);
        const { name, version } = JSON.parse(readFileSync(releasePath, "utf8"));
        const template = JSON.parse(readFileSync(templatePath, "utf8"));
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(
            {
              ...template,
              name,
              version,
              action: { ...template.action, default_title: `開啟 ${name}` },
            },
            null,
            2,
          ),
        });
      },
    },
    {
      name: "query-frame-script",
      buildStart() {
        for (const path of [
          "src/query-frame.ts",
          "../../packages/threads-client/input.js",
          "../../packages/threads-client/page-query.js",
          "../../packages/threads-client/error-report.js",
        ]) {
          this.addWatchFile(resolve(import.meta.dirname, path));
        }
      },
      async writeBundle() {
        // Content scripts cannot import the module chunks used by extension pages.
        await build({
          configFile: false,
          publicDir: false,
          build: {
            emptyOutDir: false,
            target: "esnext",
            minify: false,
            lib: {
              entry: resolve(import.meta.dirname, "src/query-frame.ts"),
              formats: ["iife"],
              name: "ThreadsQueryFrame",
              fileName: () => "query-frame.js",
            },
          },
        });
      },
    },
  ],
  build: {
    target: "esnext",
    minify: false,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        offscreen: resolve(import.meta.dirname, "offscreen.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
        "post-menu": resolve(import.meta.dirname, "src/post-menu.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "index" ? "assets/[name]-[hash].js" : "[name].js",
      },
    },
  },
});
