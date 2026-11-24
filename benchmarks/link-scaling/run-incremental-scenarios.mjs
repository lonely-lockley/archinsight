#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repository = path.join(benchmarkRoot, "generated", "company-250");
const outputDirectory = path.join(benchmarkRoot, "incremental-results");
const worker = path.join(benchmarkRoot, "incremental-scenario-worker.mjs");
const trials = Number(process.argv[2] ?? 3);
if (!Number.isInteger(trials) || trials < 1) throw new Error("Trial count must be a positive integer");

await mkdir(outputDirectory, { recursive: true });
await ensureRuntimeBuild();
await ensureRepository();

const runs = [];
let baselineMetadata;
for (let trial = 1; trial <= trials; trial += 1) {
  const result = JSON.parse((await runCommand(process.execPath, ["--expose-gc", worker, repository], benchmarkRoot, true)).trim());
  baselineMetadata ??= {
    sourceCount: result.sourceCount,
    baselineElements: result.baselineElements,
    baselineEdges: result.baselineEdges,
    baselineProjectedEdges: result.baselineProjectedEdges,
  };
  for (const scenario of result.scenarios) {
    runs.push({ trial, ...scenario });
    process.stderr.write(
      `[incremental-scenarios] trial ${trial} ${scenario.name}: ${scenario.elapsedMs.toFixed(1)} ms, `
      + `${scenario.supportSources} support, ${scenario.relinkedSources} relinked\n`,
    );
  }
}

const scenarioNames = [...new Set(runs.map((run) => run.name))];
const summaries = scenarioNames.map((name) => summarize(runs.filter((run) => run.name === name)));
const metadata = {
  generatedAt: new Date().toISOString(),
  trials,
  ...baselineMetadata,
};

await writeFile(path.join(outputDirectory, "raw.json"), `${JSON.stringify({ metadata, runs }, null, 2)}\n`, "utf8");
await writeFile(path.join(outputDirectory, "summary.csv"), summaryCsv(summaries), "utf8");
await writeFile(path.join(outputDirectory, "scenario-times.svg"), scenarioSvg(summaries, trials), "utf8");
await writeFile(path.join(outputDirectory, "REPORT.md"), reportMarkdown(summaries, metadata), "utf8");

console.log(JSON.stringify({ outputDirectory, summaries }, null, 2));

async function ensureRuntimeBuild() {
  await runCommand("npm", ["--prefix", "packages/insight-language", "run", "test:prepare"], path.join(benchmarkRoot, "../.."));
}

async function ensureRepository() {
  try {
    const manifest = JSON.parse(await readFile(path.join(repository, "manifest.json"), "utf8"));
    if (manifest.serviceCount !== 250 || manifest.environmentCount !== 15) throw new Error("stale manifest");
  } catch {
    await runCommand(process.execPath, [path.join(benchmarkRoot, "generate-repository.mjs")], benchmarkRoot);
  }
}

function runCommand(command, arguments_, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with ${code ?? signal}${stderr === "" ? "" : `\n${stderr}`}`));
    });
  });
}

function summarize(scenarioRuns) {
  const first = scenarioRuns[0];
  const elapsed = scenarioRuns.map((run) => run.elapsedMs).sort(numberAscending);
  const phase = (name) => median(scenarioRuns.map((run) => run.phases[name]?.elapsedMs ?? 0).sort(numberAscending));
  return {
    name: first.name,
    sourceName: first.sourceName,
    medianMs: median(elapsed),
    minMs: elapsed[0],
    maxMs: elapsed.at(-1),
    changedSources: first.changedSources,
    reparsedSources: first.reparsedSources,
    relinkedSources: first.relinkedSources,
    supportSources: first.supportSources,
    elements: first.elements,
    edges: first.edges,
    projectedEdges: first.projectedEdges,
    addedEdges: first.graphDelta.edges.added,
    removedEdges: first.graphDelta.edges.removed,
    changedEdges: first.graphDelta.edges.changed,
    workspaceMs: phase("link.workspace"),
    deploymentMs: phase("link.deployment"),
    relationshipsMs: phase("link.logical-relationships"),
    projectionsMs: phase("link.projections"),
    inspectionMs: phase("link.complete.inspect-graph"),
  };
}

function summaryCsv(summaries) {
  const headers = Object.keys(summaries[0]);
  return `${headers.join(",")}\n${summaries.map((row) => headers.map((header) => csvValue(row[header])).join(",")).join("\n")}\n`;
}

function reportMarkdown(summaries, metadata) {
  const rows = summaries.map((row) =>
    `| ${row.name} | ${row.medianMs.toFixed(1)} | ${row.supportSources} | ${row.relinkedSources} | ${row.edges} | ${row.projectedEdges} | +${row.addedEdges} / -${row.removedEdges} / ~${row.changedEdges} | ${row.deploymentMs.toFixed(1)} | ${row.projectionsMs.toFixed(1)} | ${row.inspectionMs.toFixed(1)} |`
  ).join("\n");
  return `# Incremental graph-change scenarios

Generated: ${metadata.generatedAt}

Each scenario edits one source in the full 250-service repository after a cold session has been created. Values are medians of ${metadata.trials} independent processes. The baseline has ${metadata.sourceCount} sources, ${metadata.baselineElements} elements, ${metadata.baselineEdges} edges, and ${metadata.baselineProjectedEdges} projected edges.

![Incremental scenario times](scenario-times.svg)

| Scenario | Median, ms | Support sources | Relinked sources | Final edges | Projected edges | Edge delta | Deployment, ms | Projections, ms | Inspection, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

The attribute scenario changes only environment metadata. Relationship and projection scenarios change graph topology and therefore use the conservative global invalidation path. Raw trials and every recorded phase are in [raw.json](raw.json).
`;
}

function scenarioSvg(summaries, trials) {
  const width = 1000;
  const height = 110 + summaries.length * 72;
  const left = 250;
  const right = 70;
  const plotWidth = width - left - right;
  const minimum = 10;
  const maximum = 10000;
  const x = (value) => left + (Math.log10(Math.max(minimum, value)) - Math.log10(minimum))
    / (Math.log10(maximum) - Math.log10(minimum)) * plotWidth;
  const ticks = [10, 100, 1000, 10000].map((value) => {
    const ordinate = x(value);
    return `<line x1="${ordinate}" y1="70" x2="${ordinate}" y2="${height - 35}" class="grid"/><text x="${ordinate}" y="${height - 15}" text-anchor="middle" class="tick">${value >= 1000 ? `${value / 1000}k` : value} ms</text>`;
  }).join("");
  const bars = summaries.map((row, index) => {
    const y = 88 + index * 72;
    return `<text x="${left - 16}" y="${y + 20}" text-anchor="end" class="label">${row.name}</text><rect x="${left}" y="${y}" width="${Math.max(2, x(row.medianMs) - left)}" height="28" rx="4" fill="#2563eb"/><text x="${x(row.medianMs) + 10}" y="${y + 20}" class="value">${row.medianMs.toFixed(1)} ms</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>text{font-family:Arial,Helvetica,sans-serif;fill:#172033}.title{font-size:24px;font-weight:700}.subtitle,.tick{font-size:12px;fill:#667085}.label{font-size:14px;font-weight:600}.value{font-size:13px}.grid{stroke:#d9deea;stroke-width:1}</style>
  <rect width="100%" height="100%" fill="#f8f9fc"/>
  <text x="${left}" y="32" class="title">Full-project incremental graph changes</text>
  <text x="${left}" y="53" class="subtitle">Median of ${trials} trials · logarithmic time axis</text>
  ${ticks}${bars}
</svg>\n`;
}

function median(values) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function numberAscending(left, right) {
  return left - right;
}

function csvValue(value) {
  return typeof value === "number" ? String(value) : `"${String(value).replaceAll('"', '""')}"`;
}
