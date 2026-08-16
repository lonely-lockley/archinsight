import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(projectDir, "package.json"), "utf8"));
const version = process.env.ARCHINSIGHT_CLI_VERSION ?? packageJson.version;
const versionFile = resolve(projectDir, "src/version.ts");

await mkdir(dirname(versionFile), { recursive: true });
await writeFile(versionFile, `export const version = "${version}";\n`);
