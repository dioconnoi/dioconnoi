import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Builds the side panel (HTML + its JS/CSS bundle) and the background
// service worker as ES modules — both the side panel's <script type="module">
// and a MV3 service_worker declared with "type": "module" support ES import
// natively, so they're built together here. The content script, which is
// injected on demand via chrome.scripting.executeScript and must run as a
// plain classic script, is built separately — see vite.content.config.ts.
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
