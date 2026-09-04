import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const baseline = JSON.parse(await readFile(
  new URL('../test-coverage-baseline.json', import.meta.url),
  'utf8',
));
const reports = {
  language: 'packages/insight-language/coverage/coverage-summary.json',
  cli: 'archinsight-cli/coverage/coverage-summary.json',
  web: 'archinsight-web/coverage/coverage-summary.json',
  renderer: 'archinsight-renderer/coverage/coverage-summary.json',
};
const metrics = ['lines', 'branches', 'functions', 'statements'];
const rows = [];

for (const [packageName, relativePath] of Object.entries(reports)) {
  const reportUrl = new URL(relativePath, `file://${repositoryRoot}/`);
  const report = JSON.parse(await readFile(reportUrl, 'utf8'));
  const expected = baseline.packages[packageName];
  rows.push([
    packageName,
    ...metrics.map((metric) => cell(report.total[metric], expected[metric])),
  ]);
}

const editorSupport = baseline.packages.editorSupport;
rows.push([
  'editor',
  editorSupport.status,
  editorSupport.status,
  editorSupport.status,
  'not reported',
]);

const graphviz = baseline.packages.graphviz;
rows.push([
  'graphviz',
  graphviz.status,
  graphviz.status,
  graphviz.status,
  'not reported',
]);

const vscode = baseline.packages.vscode;
rows.push(['vscode', vscode.status, vscode.status, vscode.status, vscode.status]);

const headers = ['package', ...metrics];
const widths = headers.map((header, index) => Math.max(
  header.length,
  ...rows.map((row) => row[index].length),
));
const line = (values) => values
  .map((value, index) => value.padEnd(widths[index]))
  .join('  ');

console.log('\nCoverage summary (current; delta from baseline)');
console.log(line(headers));
console.log(line(widths.map((width) => '-'.repeat(width))));
for (const row of rows) {
  console.log(line(row));
}
console.log('\nExact counters and scopes: test-coverage-baseline.json');

function cell(current, expected) {
  const currentRatio = current.covered / current.total;
  const expectedRatio = expected.covered / expected.total;
  const delta = (currentRatio - expectedRatio) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${percent(currentRatio)} ${current.covered}/${current.total} (${sign}${delta.toFixed(2)}pp)`;
}

function percent(ratio) {
  return `${(ratio * 100).toFixed(2)}%`;
}
