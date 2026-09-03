import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "LICENSE",
  "manifest.json",
  "package-lock.json",
  "package.json",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "assets/icon.svg",
  "cancellations/cancellations.html",
  "cancellations/cancellations.css",
  "cancellations/cancellations.js",
  "docs/releasing.md",
  "popup/popup.html",
  "options/options.html",
  "api/invitationPreview/schema.json",
  "api/invitationPreview/implementation.js",
  "vendor/ical.js",
];

await Promise.all(requiredFiles.map(path => access(resolve(root, path))));

const manifest = await readJson("manifest.json");
const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const schema = await readJson("api/invitationPreview/schema.json");
const locales = {
  de: await readJson("_locales/de/messages.json"),
  en: await readJson("_locales/en/messages.json"),
};

assert(manifest.manifest_version === 3, "Manifest Version 3 is required");
assert(manifest.version === packageJson.version, "Manifest and package versions differ");
assert(
  packageLock.version === packageJson.version &&
    packageLock.packages?.[""]?.version === packageJson.version,
  "Package and lockfile versions differ"
);
assert(packageLock.lockfileVersion === 3, "npm lockfile version 3 is required");
assert(manifest.default_locale === "en", "English must be the default locale");
assert(
  JSON.stringify(
    manifest.browser_specific_settings?.gecko?.data_collection_permissions
  ) === JSON.stringify({ required: ["none"] }),
  "The manifest must declare that no data is collected or transmitted"
);
assert(
  manifest.options_ui?.browser_style === undefined,
  "options_ui.browser_style is deprecated in Manifest V3"
);
assert(
  manifest.permissions?.includes("messagesRead") &&
    manifest.permissions?.includes("messagesUpdate"),
  "Reading and marking handled invitation messages requires both message permissions"
);
assert(
  packageJson.engines?.node === ">=22.13.0",
  "Node.js 22.13 or newer is required"
);
assert(
  packageJson.repository?.url ===
    "git+https://github.com/PM84/thunderbird-invite-preview.git",
  "The package repository URL differs"
);
assert(
  manifest.homepage_url === "https://github.com/PM84/thunderbird-invite-preview",
  "The manifest homepage URL differs"
);
assert(
  manifest.browser_specific_settings?.gecko?.strict_min_version === "154.0",
  "The minimum Thunderbird version must remain explicit"
);
assert(
  manifest.browser_specific_settings?.gecko?.strict_max_version === "154.*",
  "The maximum Thunderbird version must remain explicit"
);
assert(schema[0]?.namespace === "invitationPreview", "Experiment schema namespace differs");
const sourceIdSchema = schema[0]?.types
  ?.find(type => type.id === "StageDetails")
  ?.properties?.sourceId;
assert(
  sourceIdSchema?.minLength === 64 &&
    sourceIdSchema?.maxLength === 64 &&
    sourceIdSchema?.pattern === "^[a-f0-9]{64}$",
  "StageDetails.sourceId must accept only SHA-256 fingerprints"
);

const localeKeys = Object.keys(locales.de).sort();
assert(
  JSON.stringify(localeKeys) === JSON.stringify(Object.keys(locales.en).sort()),
  "German and English locale keys differ"
);

const localizedFiles = [
  JSON.stringify(manifest),
  await readText("popup/popup.html"),
  await readText("popup/popup.js"),
  await readText("cancellations/cancellations.html"),
  await readText("cancellations/cancellations.js"),
  await readText("options/options.html"),
  await readText("options/options.js"),
];
for (const source of localizedFiles) {
  const keys = [
    ...[...source.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map(match => match[1]),
    ...[...source.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)].map(match => match[1]),
    ...[...source.matchAll(/\bmessage\("([A-Za-z0-9_]+)"/g)].map(match => match[1]),
  ];
  for (const key of keys) {
    assert(locales.de[key], `Missing localization key: ${key}`);
  }
}

for (const htmlPath of [
  "popup/popup.html",
  "options/options.html",
  "cancellations/cancellations.html",
]) {
  const html = await readText(htmlPath);
  assert(
    !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html),
    `${htmlPath} contains inline script code`
  );
}

const releaseWorkflow = await readText(".github/workflows/release.yml");
for (const requiredValue of [
  "tags:",
  "ATN_API_KEY",
  "ATN_API_SECRET",
  "https://addons.thunderbird.net/api/v4",
  "gh release create",
]) {
  assert(
    releaseWorkflow.includes(requiredValue),
    `Release workflow is missing: ${requiredValue}`
  );
}

const vendored = await readFile(resolve(root, "vendor/ical.js"));
const installed = await readFile(resolve(root, "node_modules/ical.js/dist/ical.js"));
assert(vendored.equals(installed), "Vendored ical.js differs from the pinned npm release");

console.log("release-structure: ok");

async function readJson(path) {
  return JSON.parse(await readText(path));
}

function readText(path) {
  return readFile(resolve(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}