import { readFile, readdir } from "node:fs/promises";

const testDirectory = new URL("../test/", import.meta.url);
const fixtureExtensions = new Set([".eml", ".ics", ".js", ".json", ".mjs", ".txt"]);
const emailPattern = /(?:mailto:)?[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi;
const webUrlPattern = /https?:\/\/([^/\s"'`]+)/gi;
const localAccountPathPattern = /(?:[a-z]:[\\/](?:users|documents and settings)[\\/]|\/(?:home|users)\/|appdata[\\/]|thunderbird[\\/]profiles[\\/]|default-release)/i;

for (const file of await listFixtureFiles(testDirectory)) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(emailPattern)) {
    const domain = match[1].toLowerCase();
    assert(
      domain === "example.test" || domain.endsWith(".example.test"),
      `${displayPath(file)} contains a non-synthetic email domain`
    );
  }
  for (const match of source.matchAll(webUrlPattern)) {
    const host = match[1].split(":", 1)[0].toLowerCase();
    assert(
      host === "example.test" || host.endsWith(".example.test"),
      `${displayPath(file)} contains a non-synthetic web host`
    );
  }
  assert(
    !localAccountPathPattern.test(source),
    `${displayPath(file)} contains a local account or profile path`
  );
}

console.log("test-data-privacy: ok");

async function listFixtureFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) {
      files.push(...await listFixtureFiles(entryUrl));
    } else if (fixtureExtensions.has(extension(entry.name))) {
      files.push(entryUrl);
    }
  }
  return files;
}

function extension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? "" : fileName.slice(dotIndex).toLowerCase();
}

function displayPath(file) {
  return decodeURIComponent(file.pathname.split("/test/").at(-1));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
