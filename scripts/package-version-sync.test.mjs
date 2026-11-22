import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const synchronizer = path.join(repositoryRoot, "scripts", "sync-package-versions.mjs");

test("synchronizes package metadata and local file-dependency snapshots without rewriting registry entries", () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-version-sync-"));
  try {
    const language = fixturePackage(temporaryRoot, "language", "@insight/language", "1.0.0", {}, {
      license: "Apache-2.0",
      dependencies: { runtime: "^2.0.0", adapter: "^1.0.0" },
      devDependencies: { typescript: "^5.0.0", "@types/node": "^24.0.0" },
      peerDependencies: { typescript: ">=5" },
    });
    const consumer = fixturePackage(temporaryRoot, "consumer", "@archinsight/consumer", "1.0.0", {
      "../language": {
        name: "@insight/language",
        version: "1.0.0",
        dev: true,
        license: "MIT",
        dependencies: { stale: "1.0.0" },
        devDependencies: { stale: "1.0.0" },
        engines: { node: ">=18" },
      },
      "node_modules/@insight/language": {
        resolved: "../language",
        link: true,
      },
      "node_modules/registry-package": {
        name: "registry-package",
        version: "9.9.9",
        resolved: "https://registry.npmjs.org/registry-package/-/registry-package-9.9.9.tgz",
      },
    });
    const plan = JSON.stringify([
      { directory: language, version: "2.1.0" },
      { directory: consumer, version: "3.4.0" },
    ]);

    const first = run(plan, temporaryRoot);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Synchronized package versions in 4 files/);

    assert.equal(json(path.join(language, "package.json")).version, "2.1.0");
    const languageLock = json(path.join(language, "package-lock.json"));
    assert.equal(languageLock.version, "2.1.0");
    assert.deepEqual(languageLock.packages[""], {
      name: "@insight/language",
      version: "2.1.0",
      license: "Apache-2.0",
      dependencies: { adapter: "^1.0.0", runtime: "^2.0.0" },
      devDependencies: { "@types/node": "^24.0.0", typescript: "^5.0.0" },
      peerDependencies: { typescript: ">=5" },
    });

    assert.equal(json(path.join(consumer, "package.json")).version, "3.4.0");
    const consumerLockFile = path.join(consumer, "package-lock.json");
    const consumerLock = json(consumerLockFile);
    assert.equal(consumerLock.version, "3.4.0");
    assert.equal(consumerLock.packages[""].version, "3.4.0");
    assert.deepEqual(consumerLock.packages["../language"], {
      name: "@insight/language",
      version: "2.1.0",
      dev: true,
      license: "Apache-2.0",
      dependencies: { adapter: "^1.0.0", runtime: "^2.0.0" },
      devDependencies: { "@types/node": "^24.0.0", typescript: "^5.0.0" },
      peerDependencies: { typescript: ">=5" },
    });
    assert.equal(consumerLock.packages["node_modules/registry-package"].version, "9.9.9");

    const afterFirstRun = readFileSync(consumerLockFile, "utf8");
    const second = run(plan, temporaryRoot);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, "Package versions already synchronized.\n");
    assert.equal(readFileSync(consumerLockFile, "utf8"), afterFirstRun);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("preserves established package-lock field order", () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-version-order-"));
  try {
    const packageDirectory = fixturePackage(
      temporaryRoot,
      "package",
      "example",
      "1.0.0",
      {},
      {
        license: "Apache-2.0",
        bin: { example: "build/index.js" },
        dependencies: { runtime: "^2.0.0" },
      },
      {
        license: "Apache-2.0",
        dependencies: { runtime: "^1.0.0" },
        bin: { example: "old.js" },
      },
    );
    const lockFile = path.join(packageDirectory, "package-lock.json");

    const result = run(JSON.stringify([
      { directory: packageDirectory, version: "2.0.0" },
    ]), temporaryRoot);
    assert.equal(result.status, 0, result.stderr);

    const lock = readFileSync(lockFile, "utf8");
    assert.ok(lock.indexOf('"dependencies"') < lock.indexOf('"bin"'));
    assert.deepEqual(json(lockFile).packages[""], {
      name: "example",
      version: "2.0.0",
      license: "Apache-2.0",
      dependencies: { runtime: "^2.0.0" },
      bin: { example: "build/index.js" },
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects duplicate package directories before writing", () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-version-plan-"));
  try {
    const packageDirectory = fixturePackage(temporaryRoot, "package", "example", "1.0.0");
    const result = run(JSON.stringify([
      { directory: packageDirectory, version: "2.0.0" },
      { directory: packageDirectory, version: "3.0.0" },
    ]), temporaryRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Duplicate package directory/);
    assert.equal(json(path.join(packageDirectory, "package.json")).version, "1.0.0");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("Gradle version synchronization has no npm installation fallback", () => {
  const build = readFileSync(path.join(repositoryRoot, "build.gradle"), "utf8");
  const syncTask = gradleTaskBlock(build, "syncPackageVersions");
  assert.match(syncTask, /scripts\/sync-package-versions\.mjs/);
  assert.doesNotMatch(syncTask, /commandLine\s+npmCommand|package-lock-only|['"]install['"]/);
});

test("Gradle uses one project version for every artifact", () => {
  const settings = readFileSync(path.join(repositoryRoot, "settings.gradle"), "utf8");
  const build = readFileSync(path.join(repositoryRoot, "build.gradle"), "utf8");

  assert.match(settings, /gradle\.ext\.archinsightVersion\s*=\s*'[^']+'/);
  assert.doesNotMatch(settings, /archinsightVersions/);
  assert.match(build, /def artifactVersion = gradle\.ext\.archinsightVersion/);
  assert.match(build, /allprojects\s*\{[\s\S]*?version = artifactVersion[\s\S]*?\}/);
  assert.match(build, /inputs\.property\('version', artifactVersion\)/);
  assert.doesNotMatch(build, /versionKey|artifactVersions/);
});

function gradleTaskBlock(source, taskName) {
  const start = source.indexOf(`tasks.register('${taskName}')`);
  assert.notEqual(start, -1, `Missing Gradle task ${taskName}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unterminated Gradle task ${taskName}`);
}

test("Gradle dependency installation remains registry-capable without audit waits", () => {
  const gradleFiles = [
    "build.gradle",
    "archinsight-cli/build.gradle",
    "archinsight-web/build.gradle",
    "archinsight-vscode/build.gradle",
    "archinsight-renderer/build.gradle",
  ];
  for (const relativePath of gradleFiles) {
    const build = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    assert.match(build, /commandLine npmCommand, 'install', '--prefer-offline', '--no-audit', '--no-fund'/);
    assert.doesNotMatch(build, /commandLine npmCommand, 'install', '--offline'/);
  }

  for (const relativePath of ["archinsight-web/Dockerfile", "archinsight-renderer/Dockerfile"]) {
    const dockerfile = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    assert.match(dockerfile, /npm ci --omit=dev --prefer-offline --no-audit --no-fund/);
    assert.doesNotMatch(dockerfile, /npm ci [^\n]*--offline(?:\s|$)/);
  }
});

function fixturePackage(
  root,
  directoryName,
  name,
  version,
  extraSnapshots = {},
  packageMetadata = {},
  rootSnapshotMetadata = {},
) {
  const directory = path.join(root, directoryName);
  mkdirSync(directory);
  writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({
    name,
    version,
    ...packageMetadata,
  }, null, 2)}\n`);
  writeFileSync(path.join(directory, "package-lock.json"), `${JSON.stringify({
    name,
    version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name, version, ...rootSnapshotMetadata },
      ...extraSnapshots,
    },
  }, null, 2)}\n`);
  return directory;
}

function run(plan, cwd) {
  return spawnSync(process.execPath, [synchronizer, plan], { cwd, encoding: "utf8" });
}

function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
