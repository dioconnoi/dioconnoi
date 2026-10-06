import { cpSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

mkdirSync(dist, { recursive: true });
copyFileSync(join(root, "manifest.json"), join(dist, "manifest.json"));

const iconsSrc = join(root, "public", "icons");
if (existsSync(iconsSrc)) {
  cpSync(iconsSrc, join(dist, "icons"), { recursive: true });
}

console.log("Copied manifest.json and icons/ into dist/");
