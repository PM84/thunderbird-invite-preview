import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ZipArchive } from "archiver";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const artifactDirectory = resolve(root, "dist");
const artifactPath = resolve(
  artifactDirectory,
  `invite-preview-${manifest.version}.xpi`
);
const packageEntries = [
  "_locales",
  "api",
  "assets",
  "options",
  "popup",
  "src",
  "vendor",
  "LICENSE",
  "manifest.json",
];
const archiveDate = new Date("1980-01-01T00:00:00Z");

await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });

const output = createWriteStream(artifactPath);
const archive = new ZipArchive({ zlib: { level: 9 } });
const completed = new Promise((resolvePromise, rejectPromise) => {
  output.on("close", resolvePromise);
  output.on("error", rejectPromise);
  archive.on("error", rejectPromise);
});

archive.pipe(output);
for (const entry of packageEntries) {
  await appendPath(resolve(root, entry));
}
await archive.finalize();
await completed;

console.log(`Created ${artifactPath}`);

async function appendPath(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (entries) {
    for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
      await appendPath(join(path, entry.name));
    }
    return;
  }

  archive.file(path, {
    name: relative(root, path),
    date: archiveDate,
    mode: 0o100644,
  });
}