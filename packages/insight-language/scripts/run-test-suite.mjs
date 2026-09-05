import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerContractFiles } from '../../../scripts/contract-test-runner.mjs';

const scope = process.argv[2] ?? 'runtime';
if (scope !== 'contracts' && scope !== 'runtime') {
  throw new Error(`Unknown language test scope '${scope}'`);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const contractFiles = readdirSync(scriptDirectory)
  .filter((name) => name.endsWith('-contracts.mjs'))
  .map((name) => path.join('scripts', name))
  .sort();
const runtimeFiles = [
  path.join('scripts', 'core-snapshot-check.mjs'),
  path.join('scripts', 'completion-golden.mjs'),
  path.join('scripts', 'parser-failure.mjs'),
  ...contractFiles,
].sort();

registerContractFiles(scope === 'contracts' ? contractFiles : runtimeFiles, {
  cwd: path.resolve(scriptDirectory, '..'),
});
