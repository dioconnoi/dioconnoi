import { defineConfig } from "vite";
import { resolve } from "path";

// Separate build pass for the content script: IIFE format with no code
// splitting, so the output is one self-contained classic script (no
// import/export statements) safe to inject via
// chrome.scripting.executeScript({ files: ["content/picker.js"] }).
export default defineConfig({
  root: __dirname,
  build: {
    outDir: "dist",
    emptyOutDir: false, // the main vite.config.ts build runs first and already cleared dist/
    lib: {
      entry: resolve(__dirname, "src/content/picker.ts"),
      name: "VisaCheckerPicker",
      formats: ["iife"],
      fileName: () => "content/picker.js",
    },
  },
});
