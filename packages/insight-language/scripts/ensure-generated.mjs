import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredSources = [
  'src/generated/InsightLexer.ts',
  'src/generated/InsightParser.ts',
  'src/generated/core-source.ts',
  'src/generated/builtin-view-catalog.ts'
];

if (process.env.ARCHINSIGHT_LANGUAGE_SOURCES_READY === 'true') {
  const missing = requiredSources.filter((path) => !existsSync(resolve(packageDirectory, path)));
  if (missing.length > 0) {
    throw new Error(`Gradle marked language sources as ready, but these files are missing: ${missing.join(', ')}`);
  }
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const generated = spawnSync(npmCommand, ['run', 'generate:grammar'], {
  cwd: packageDirectory,
  env: process.env,
  stdio: 'inherit'
});

if (generated.error) {
  throw generated.error;
}
process.exit(generated.status ?? 1);
