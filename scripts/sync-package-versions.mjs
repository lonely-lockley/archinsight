import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const plan = parsePlan(process.argv[2]);
const packageSet = await loadPackages(plan);
let updatedFiles = 0;

for (const packageDefinition of packageSet.entries) {
  updatedFiles += await updateJson(packageDefinition.packageJsonFile, (packageJson) => {
    assertPackageName(packageJson, packageDefinition, "package.json");
    packageJson.version = packageDefinition.version;
  });

  updatedFiles += await updateJson(packageDefinition.packageLockFile, (packageLock) => {
    assertPackageName(packageLock, packageDefinition, "package-lock.json");
    if (packageLock.lockfileVersion !== 3 || typeof packageLock.packages !== "object" || packageLock.packages === null) {
      throw new Error(`${packageDefinition.packageLockFile} must use npm lockfileVersion 3`);
    }
    const rootSnapshot = packageLock.packages[""];
    if (typeof rootSnapshot !== "object" || rootSnapshot === null) {
      throw new Error(`${packageDefinition.packageLockFile} has no root package snapshot`);
    }
    assertPackageName(rootSnapshot, packageDefinition, "package-lock.json root snapshot");
    packageLock.version = packageDefinition.version;
    rootSnapshot.version = packageDefinition.version;

    for (const [snapshotPath, snapshot] of Object.entries(packageLock.packages)) {
      if (snapshotPath === "" || typeof snapshot !== "object" || snapshot === null) {
        continue;
      }
      const localPackage = packageSet.byDirectory.get(path.resolve(packageDefinition.directory, snapshotPath));
      if (localPackage === undefined) {
        continue;
      }
      assertPackageName(snapshot, localPackage, `local snapshot '${snapshotPath}'`);
      snapshot.version = localPackage.version;
    }
  });
}

process.stdout.write(updatedFiles === 0
  ? "Package versions already synchronized.\n"
  : `Synchronized package versions in ${updatedFiles} file${updatedFiles === 1 ? "" : "s"}.\n`);

function parsePlan(rawPlan) {
  if (rawPlan === undefined) {
    throw new Error("Usage: node scripts/sync-package-versions.mjs '<json-plan>'");
  }
  const value = JSON.parse(rawPlan);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Package version plan must be a non-empty array");
  }
  const directories = new Set();
  return value.map((entry, index) => {
    if (typeof entry?.directory !== "string" || entry.directory.length === 0
      || typeof entry?.version !== "string" || entry.version.length === 0) {
      throw new Error(`Invalid package version plan entry at index ${index}`);
    }
    const directory = path.resolve(entry.directory);
    if (directories.has(directory)) {
      throw new Error(`Duplicate package directory '${directory}'`);
    }
    directories.add(directory);
    return { directory, version: entry.version };
  });
}

async function loadPackages(packagePlan) {
  const result = [];
  const byDirectory = new Map();
  for (const entry of packagePlan) {
    const packageJsonFile = path.join(entry.directory, "package.json");
    const packageLockFile = path.join(entry.directory, "package-lock.json");
    const packageJson = JSON.parse(await readFile(packageJsonFile, "utf8"));
    if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
      throw new Error(`${packageJsonFile} has no package name`);
    }
    const definition = {
      ...entry,
      name: packageJson.name,
      packageJsonFile,
      packageLockFile,
    };
    result.push(definition);
    byDirectory.set(entry.directory, definition);
  }
  return { entries: result, byDirectory };
}

function assertPackageName(value, packageDefinition, description) {
  if (value.name !== packageDefinition.name) {
    throw new Error(
      `${description} name '${String(value.name)}' does not match package '${packageDefinition.name}'`,
    );
  }
}

async function updateJson(file, update) {
  const original = await readFile(file, "utf8");
  const value = JSON.parse(original);
  update(value);
  const updated = `${JSON.stringify(value, null, 2)}\n`;
  if (updated === original) {
    return 0;
  }
  const temporaryFile = `${file}.tmp-${process.pid}`;
  await writeFile(temporaryFile, updated);
  await rename(temporaryFile, file);
  return 1;
}
