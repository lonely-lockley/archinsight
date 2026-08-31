import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerContractFiles } from '../../scripts/contract-test-runner.mjs';

const scope = process.argv[2] ?? 'all';
if (!['all', 'cli', 'skill'].includes(scope)) {
  throw new Error(`Unknown CLI test scope '${scope}'`);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const contractFiles = readdirSync(scriptDirectory)
  .filter((name) => name.endsWith('-contracts.mjs'))
  .map((name) => path.join('scripts', name))
  .sort();
const files = contractFiles.filter((name) => {
  const skill = name.includes('skill-contracts');
  return scope === 'all' || (scope === 'skill' ? skill : !skill);
});

registerContractFiles(files, { cwd: path.resolve(scriptDirectory, '..') });
