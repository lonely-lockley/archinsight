import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const [, , inputPath, outputPath, ...filters] = process.argv;
if (inputPath === undefined || outputPath === undefined) {
  throw new Error(
    'Usage: node scripts/filter-coverage-summary.mjs <input> <output> '
    + '[--include=<path-fragment>] [--exclude=<path-fragment>]',
  );
}

const includes = values('--include=');
const excludes = values('--exclude=');
assert(includes.length > 0, 'At least one --include path fragment is required');

const summary = JSON.parse(await readFile(inputPath, 'utf8'));
const selected = Object.entries(summary).filter(([file]) => file !== 'total'
  && includes.some((fragment) => file.includes(fragment))
  && excludes.every((fragment) => !file.includes(fragment)));
assert(selected.length > 0, `No coverage files matched ${includes.join(', ')}`);

const total = {};
for (const metric of ['lines', 'branches', 'functions', 'statements']) {
  const counts = selected.reduce((result, [, file]) => ({
    total: result.total + file[metric].total,
    covered: result.covered + file[metric].covered,
    skipped: result.skipped + file[metric].skipped,
  }), { total: 0, covered: 0, skipped: 0 });
  total[metric] = {
    ...counts,
    pct: counts.total === 0 ? 100 : Math.floor((counts.covered / counts.total) * 10_000) / 100,
  };
}

await writeFile(outputPath, `${JSON.stringify({ total, ...Object.fromEntries(selected) }, null, 2)}\n`);

function values(prefix) {
  return filters.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length));
}
