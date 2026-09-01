import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../vendor/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../node_modules/ical.js/dist/ical.js", import.meta.url),
  new URL("../vendor/ical.js", import.meta.url)
);