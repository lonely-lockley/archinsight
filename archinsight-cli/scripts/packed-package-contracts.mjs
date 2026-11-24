import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const temporaryRoot = mkdtempSync(path.join(tmpdir(), "archinsight-cli-package-"));
const packageDirectory = path.join(temporaryRoot, "package");
const packDirectory = path.join(temporaryRoot, "pack");
const projectDirectory = path.join(temporaryRoot, "project");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  mkdirSync(packDirectory);
  const packed = JSON.parse(execFileSync(
    npm,
    ["pack", "--json", "--pack-destination", packDirectory],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: path.join(temporaryRoot, "npm-cache") },
    },
  ))[0];
  const packedFiles = new Set(packed.files.map(({ path: file }) => file));
  assert(packedFiles.has("build/project-source-parser-worker.js"), "npm package omits the parser worker");
  assert(packedFiles.has("build/project-source-parser-worker.js.map"), "npm package omits the parser worker source map");

  extractBuildFiles(path.join(packDirectory, packed.filename), temporaryRoot);
  symlinkSync(
    path.resolve("node_modules"),
    path.join(packageDirectory, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  mkdirSync(projectDirectory);
  writeFileSync(path.join(projectDirectory, "model.ai"), `context sample

system application
    name = Application
`);

  const linked = spawnSync(
    process.execPath,
    [path.join(packageDirectory, "build", "index.js"), "link", projectDirectory, "--format", "json"],
    { cwd: packageDirectory, encoding: "utf8" },
  );
  assert.equal(linked.status, 0, linked.stderr);
  assert.equal(JSON.parse(linked.stdout).summary.ERROR, 0);
  console.log("Packed CLI cold-link contract passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function extractBuildFiles(tarball, destination) {
  const archive = gunzipSync(readFileSync(tarball));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return;
    const name = tarText(header.subarray(0, 100));
    const prefix = tarText(header.subarray(345, 500));
    const entry = prefix.length > 0 ? `${prefix}/${name}` : name;
    const size = Number.parseInt(tarText(header.subarray(124, 136)).trim() || "0", 8);
    const contentStart = offset + 512;
    if (entry.startsWith("package/build/") && header[156] !== 53) {
      const output = path.resolve(destination, entry);
      assert(output.startsWith(`${path.resolve(destination)}${path.sep}`), `Unsafe tar entry '${entry}'`);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, archive.subarray(contentStart, contentStart + size));
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
}

function tarText(bytes) {
  const zero = bytes.indexOf(0);
  return bytes.subarray(0, zero === -1 ? bytes.length : zero).toString("utf8");
}
