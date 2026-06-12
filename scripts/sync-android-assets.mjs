import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "android", "app", "src", "main", "assets", "www");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "landmark-data.js",
  "manifest.webmanifest",
  "sw.js",
  "assets",
  "data/qr-images",
];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of files) {
  const destination = join(target, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, file), destination, { recursive: true });
}

console.log(`Synced ${files.length} web app entries to ${target}`);
