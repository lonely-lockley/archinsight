import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [, , packageName, summaryPath] = process.argv;
if (packageName === undefined || summaryPath === undefined) {
  throw new Error('Usage: node scripts/check-coverage.mjs <package> <coverage-summary.json>');
}

const baselinePath = fileURLToPath(new URL('../test-coverage-baseline.json', import.meta.url));
const baselineDocument = JSON.parse(await readFile(baselinePath, 'utf8'));
const baseline = baselineDocument.packages?.[packageName];
assert(baseline !== undefined, `No coverage baseline is registered for '${packageName}'`);

const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
const current = summary.total;
assert(current !== undefined, `Coverage summary '${summaryPath}' has no total record`);

let failed = false;
for (const metric of ['lines', 'branches', 'functions', 'statements']) {
  const expected = baseline[metric];
  const actual = current[metric];
  assert(expected !== undefined, `Baseline '${packageName}' has no '${metric}' metric`);
  assert(actual !== undefined, `Coverage summary '${summaryPath}' has no '${metric}' metric`);
  assert(actual.total > 0, `Coverage metric '${packageName}.${metric}' has an empty denominator`);
  const expectedRatio = expected.covered / expected.total;
  const actualRatio = actual.covered / actual.total;
  const status = actualRatio + Number.EPSILON >= expectedRatio ? 'ok' : 'REGRESSION';
  console.log(
    `${packageName}.${metric}: ${percent(actualRatio)} (${actual.covered}/${actual.total}), `
    + `baseline ${percent(expectedRatio)} (${expected.covered}/${expected.total}) [${status}]`,
  );
  failed ||= status === 'REGRESSION';
}

if (failed) {
  console.error(
    `Coverage for '${packageName}' fell below test-coverage-baseline.json. `
    + 'Add tests or update the reviewed baseline with an explicit justification.',
  );
  process.exitCode = 1;
}

function percent(ratio) {
  return `${(ratio * 100).toFixed(2)}%`;
}
