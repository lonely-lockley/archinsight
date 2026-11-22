#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repository = path.join(benchmarkRoot, "generated", "company-250");
const outputDirectory = path.join(benchmarkRoot, "phase-results");
const worker = path.join(benchmarkRoot, "phase-worker.mjs");
const allCounts = sequence(10, 250, 10);
const controlCounts = [10, 80, 140, 180, 210, 220, 250];
const renderOnly = process.argv.includes("--render-only");

await mkdir(outputDirectory, { recursive: true });

let runs;
let metadata;
if (renderOnly) {
  ({ runs, metadata } = JSON.parse(await readFile(path.join(outputDirectory, "raw.json"), "utf8")));
} else {
  await ensureRuntimeBuild();
  await ensureRepository();
  runs = [];
  for (const serviceCount of allCounts) {
    runs.push({ trial: 1, ...(await runWorker(serviceCount)) });
    printRun(runs.at(-1));
  }
  for (const serviceCount of controlCounts) {
    for (let trial = 2; trial <= 3; trial += 1) {
      runs.push({ trial, ...(await runWorker(serviceCount)) });
      printRun(runs.at(-1));
    }
  }
  metadata = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    oneTrialCounts: allCounts.filter((count) => !controlCounts.includes(count)),
    threeTrialCounts: controlCounts,
    methodology: "Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in",
  };
  await writeFile(path.join(outputDirectory, "raw.json"), `${JSON.stringify({ metadata, runs }, null, 2)}\n`, "utf8");
}

const phaseNames = [...new Set(runs.flatMap((run) => Object.keys(run.phases)))].sort();
const summaries = allCounts.map((serviceCount) => summarize(
  runs.filter((run) => run.serviceCount === serviceCount),
  phaseNames,
));
await writeFile(path.join(outputDirectory, "summary.csv"), summaryCsv(summaries), "utf8");
await writeFile(path.join(outputDirectory, "phase-timings.svg"), phaseChart(summaries), "utf8");
await writeFile(path.join(outputDirectory, "secondary-phase-timings.svg"), secondaryPhaseChart(summaries), "utf8");
await writeFile(path.join(outputDirectory, "REPORT.md"), report(summaries, metadata), "utf8");

console.log(JSON.stringify({ outputDirectory, fullScale: summaries.at(-1) }, null, 2));

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

async function runWorker(serviceCount) {
  const output = await runCommand(
    process.execPath,
    ["--expose-gc", worker, repository, String(serviceCount)],
    benchmarkRoot,
    true,
  );
  return JSON.parse(output.trim());
}

function printRun(run) {
  const graphBuild = run.phases["link.logical.build-implementation-graph"];
  process.stderr.write(
    `[phase-scaling] ${run.serviceCount} services trial ${run.trial}: ${run.elapsedMs.toFixed(1)} ms total, ${graphBuild === undefined ? "no implementation graph rebuild" : `${graphBuild.elapsedMs.toFixed(1)} ms implementation graph`}\n`,
  );
}

function summarize(experimentRuns, phaseNames) {
  const first = experimentRuns[0];
  const phaseMedians = Object.fromEntries(phaseNames.map((phase) => [phase, {
    elapsedMs: median(experimentRuns.map((run) => run.phases[phase]?.elapsedMs ?? 0).sort(numberAscending)),
    calls: median(experimentRuns.map((run) => run.phases[phase]?.calls ?? 0).sort(numberAscending)),
  }]));
  return {
    serviceCount: first.serviceCount,
    trials: experimentRuns.length,
    sourceCount: first.sourceCount,
    sourceLines: first.sourceLines,
    elements: first.elements,
    edges: first.edges,
    elapsedMs: median(experimentRuns.map((run) => run.elapsedMs).sort(numberAscending)),
    phases: phaseMedians,
  };
}

function summaryCsv(summaries) {
  const selectedPhases = [
    "session.classify-sources",
    "session.build-snapshot",
    "link.workspace",
    "link.workspace.parse-documents",
    "link.deployment",
    "link.logical-relationships",
    "link.logical.build-implementation-graph",
    "link.logical.snapshot-endpoints",
    "link.logical.materialize-edge",
    "link.projections",
    "link.complete",
  ];
  const headers = ["serviceCount", "trials", "sourceCount", "elements", "edges", "elapsedMs", ...selectedPhases];
  const rows = summaries.map((row) => [
    row.serviceCount,
    row.trials,
    row.sourceCount,
    row.elements,
    row.edges,
    row.elapsedMs,
    ...selectedPhases.map((phase) => row.phases[phase]?.elapsedMs ?? 0),
  ]);
  return `${headers.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}\n`;
}

function report(summaries, metadata) {
  const full = summaries.at(-1);
  const ten = summaries[0];
  const topLevelPhases = topLevelBreakdown(full);
  const logical = logicalBreakdown(full);
  const graphPhase = full.phases["link.logical.build-implementation-graph"];
  const logicalShare = full.phases["link.logical-relationships"].elapsedMs / full.elapsedMs * 100;
  const finding = graphPhase === undefined
    ? `At 250 services, logical relationship materialization consumes ${full.phases["link.logical-relationships"].elapsedMs.toFixed(1)} ms (${logicalShare.toFixed(1)}% of ${full.elapsedMs.toFixed(1)} ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in ${phase(full, "link.complete.build-indexed-graph").toFixed(1)} ms.

Cold link time grows ${(full.elapsedMs / ten.elapsedMs).toFixed(1)}× while service count grows 25×. The other top-level phases at full scale are: ${topLevelPhases.map(([name, milliseconds]) => `${name} ${milliseconds.toFixed(1)} ms`).join(", ")}.`
    : graphRebuildFinding(summaries, full, ten, graphPhase, logicalShare, topLevelPhases);
  const table = summaries.map((row) => {
    const graph = row.phases["link.logical.build-implementation-graph"]?.elapsedMs ?? 0;
    return `| ${row.serviceCount} | ${row.trials} | ${row.elapsedMs.toFixed(1)} | ${row.phases["session.classify-sources"].elapsedMs.toFixed(1)} | ${row.phases["link.workspace"].elapsedMs.toFixed(1)} | ${row.phases["link.deployment"].elapsedMs.toFixed(1)} | ${row.phases["link.logical-relationships"].elapsedMs.toFixed(1)} | ${graph.toFixed(1)} | ${row.phases["link.projections"].elapsedMs.toFixed(1)} | ${row.phases["link.complete"].elapsedMs.toFixed(1)} |`;
  }).join("\n");
  return `# Linker phase timing report

Generated: ${metadata.generatedAt}. ${metadata.methodology}.

Every +10 service point has one phase-profiled run. Control points ${metadata.threeTrialCounts.join(", ")} have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

${finding}

Inside logical relationship materialization, the remaining measured work is: ${logical.map(([name, milliseconds]) => `${name} ${milliseconds.toFixed(1)} ms`).join(", ")}.

## Measurements

| Services | Trials | Total ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
`;
}

function graphRebuildFinding(summaries, full, ten, graphPhase, logicalShare, topLevelPhases) {
  const graphShare = graphPhase.elapsedMs / full.elapsedMs * 100;
  const averageGraphBuild = graphPhase.elapsedMs / graphPhase.calls;
  const graphGrowth = graphPhase.elapsedMs / ten.phases["link.logical.build-implementation-graph"].elapsedMs;
  const graphExponent = logLogExponent(summaries.map((row) => [
    row.serviceCount,
    row.phases["link.logical.build-implementation-graph"].elapsedMs,
  ]));
  return `At 250 services, logical relationship materialization consumes ${full.phases["link.logical-relationships"].elapsedMs.toFixed(1)} ms (${logicalShare.toFixed(1)}% of ${full.elapsedMs.toFixed(1)} ms total). Rebuilding the operator implementation graph consumes ${graphPhase.elapsedMs.toFixed(1)} ms (${graphShare.toFixed(1)}% total) across ${graphPhase.calls} calls, averaging ${averageGraphBuild.toFixed(2)} ms per authored relationship.

The hot loop calls \`buildIndexedGraph(documents, elements, imports, linkedEdges, typeSystem)\` once for every logical relationship before invoking its operator implementation. Each call scans the full project model and an increasingly large accumulated edge list. The measured dominance and the loop structure together explain the superlinear curve: the linker repeatedly reconstructs substantially the same graph. This subphase grows ${graphGrowth.toFixed(1)}× for 25× more services; a log-log fit across all 25 points has exponent ${graphExponent.toFixed(2)}, very close to quadratic growth.

Cold link time grows ${(full.elapsedMs / ten.elapsedMs).toFixed(1)}× while service count grows 25×. The other top-level phases at full scale are: ${topLevelPhases.map(([name, milliseconds]) => `${name} ${milliseconds.toFixed(1)} ms`).join(", ")}.`;
}

function topLevelBreakdown(row) {
  return [
    ["source classification", phase(row, "session.classify-sources")],
    ["snapshot build", phase(row, "session.build-snapshot")],
    ["workspace", phase(row, "link.workspace")],
    ["deployment", phase(row, "link.deployment")],
    ["projections", phase(row, "link.projections")],
    ["completion", phase(row, "link.complete")],
  ];
}

function logicalBreakdown(row) {
  const total = phase(row, "link.logical-relationships");
  const graph = phase(row, "link.logical.build-implementation-graph");
  const endpoints = phase(row, "link.logical.snapshot-endpoints");
  const materialize = phase(row, "link.logical.materialize-edge");
  return [
    ...(row.phases["link.logical.build-implementation-graph"] === undefined ? [] : [["graph rebuild", graph]]),
    ["endpoint snapshots", endpoints],
    ["operator implementation", materialize],
    ["resolution and bookkeeping", Math.max(0, total - graph - endpoints - materialize)],
  ];
}

function phaseChart(summaries) {
  const width = 1240;
  const height = 820;
  const margin = { left: 90, right: 34, top: 116, bottom: 64 };
  const gap = 90;
  const panelHeight = (height - margin.top - margin.bottom - gap) / 2;
  const plotWidth = width - margin.left - margin.right;
  const x = (count) => margin.left + (count - 10) / 240 * plotWidth;
  const topMax = niceMaximum(Math.max(...summaries.map((row) => row.elapsedMs)));
  const logicalMax = niceMaximum(Math.max(...summaries.map((row) => phase(row, "link.logical-relationships"))));
  const y = (value, top, maximum) => top + panelHeight - value / maximum * panelHeight;
  const topOne = margin.top;
  const topTwo = margin.top + panelHeight + gap;
  const topSeries = [
    ["Total", (row) => row.elapsedMs, "#111827", 3.2],
    ["Logical relationships", (row) => phase(row, "link.logical-relationships"), "#dc2626", 2.5],
    ["Workspace", (row) => phase(row, "link.workspace"), "#2563eb", 2],
    ["Deployment", (row) => phase(row, "link.deployment"), "#7c3aed", 2],
    ["Complete", (row) => phase(row, "link.complete"), "#0f766e", 2],
  ];
  const logicalSeries = [
    ["Logical total", (row) => phase(row, "link.logical-relationships"), "#dc2626", 3.2],
    ...(summaries.some((row) => row.phases["link.logical.build-implementation-graph"] !== undefined)
      ? [["Implementation graph rebuilds", (row) => phase(row, "link.logical.build-implementation-graph"), "#f59e0b", 2.5]]
      : []),
    ["Operator implementation", (row) => phase(row, "link.logical.materialize-edge"), "#2563eb", 2],
  ];
  const seriesMarkup = (series, top, maximum) => series.map(([name, accessor, color, stroke], index) => {
    const pathData = summaries.map((row, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${x(row.serviceCount).toFixed(2)},${y(accessor(row), top, maximum).toFixed(2)}`).join(" ");
    const points = summaries.map((row) => `<circle cx="${x(row.serviceCount).toFixed(2)}" cy="${y(accessor(row), top, maximum).toFixed(2)}" r="2.4" fill="${color}"/>`).join("");
    return `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${stroke}"/>${points}<line x1="${margin.left + index * 205}" y1="${top - 30}" x2="${margin.left + index * 205 + 24}" y2="${top - 30}" stroke="${color}" stroke-width="${stroke}"/><text x="${margin.left + index * 205 + 31}" y="${top - 25}" class="legend">${name}</text>`;
  }).join("");
  const grid = (top, maximum) => Array.from({ length: 6 }, (_, index) => {
    const value = maximum * index / 5;
    const ordinate = y(value, top, maximum);
    return `<line x1="${margin.left}" y1="${ordinate}" x2="${width - margin.right}" y2="${ordinate}" class="grid"/><text x="${margin.left - 12}" y="${ordinate + 4}" text-anchor="end" class="tick">${axis(value)}</text>`;
  }).join("");
  const xTicks = summaries.filter((row) => row.serviceCount % 20 === 0 || row.serviceCount === 10 || row.serviceCount === 250).map((row) => {
    const coordinate = x(row.serviceCount);
    return `<text x="${coordinate}" y="${topTwo + panelHeight + 26}" text-anchor="middle" class="tick">${row.serviceCount}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Archinsight linker phase timings</title>
  <desc id="description">Total and per-phase cold link times for 10 to 250 services.</desc>
  <style>text{font-family:Arial,Helvetica,sans-serif;fill:#172033}.title{font-size:25px;font-weight:700}.subtitle{font-size:13px;fill:#5b6475}.legend{font-size:11px;fill:#344054}.tick{font-size:11px;fill:#667085}.grid{stroke:#d9deea;stroke-width:1}</style>
  <rect width="100%" height="100%" fill="#f8f9fc"/>
  <text x="${margin.left}" y="34" class="title">Cold linker phase timings</text>
  <text x="${margin.left}" y="56" class="subtitle">Same deterministic 15-environment repository · every +10 services</text>
  ${grid(topOne, topMax)}${seriesMarkup(topSeries, topOne, topMax)}
  ${grid(topTwo, logicalMax)}${seriesMarkup(logicalSeries, topTwo, logicalMax)}
  ${xTicks}<text x="${margin.left + plotWidth / 2}" y="${height - 16}" text-anchor="middle">Services</text>
</svg>\n`;
}

function secondaryPhaseChart(summaries) {
  const width = 1240;
  const height = 500;
  const margin = { left: 90, right: 34, top: 116, bottom: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const series = [
    ["Source classification", (row) => phase(row, "session.classify-sources"), "#7c3aed"],
    ["Workspace parse", (row) => phase(row, "link.workspace.parse-documents"), "#2563eb"],
    ["Deployment", (row) => phase(row, "link.deployment"), "#dc2626"],
    ["Graph inspection", (row) => phase(row, "link.complete.inspect-graph"), "#0f766e"],
    ["Projections", (row) => phase(row, "link.projections"), "#d97706"],
  ];
  const maximum = niceMaximum(Math.max(
    ...summaries.flatMap((row) => series.map(([, accessor]) => accessor(row))),
  ));
  const x = (count) => margin.left + (count - 10) / 240 * plotWidth;
  const y = (value) => margin.top + plotHeight - value / maximum * plotHeight;
  const grid = Array.from({ length: 6 }, (_, index) => {
    const value = maximum * index / 5;
    const ordinate = y(value);
    return `<line x1="${margin.left}" y1="${ordinate}" x2="${width - margin.right}" y2="${ordinate}" class="grid"/><text x="${margin.left - 12}" y="${ordinate + 4}" text-anchor="end" class="tick">${axis(value)}</text>`;
  }).join("");
  const lines = series.map(([name, accessor, color], index) => {
    const pathData = summaries.map((row, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${x(row.serviceCount).toFixed(2)},${y(accessor(row)).toFixed(2)}`).join(" ");
    const dots = summaries.map((row) => `<circle cx="${x(row.serviceCount).toFixed(2)}" cy="${y(accessor(row)).toFixed(2)}" r="2.4" fill="${color}"/>`).join("");
    const legendX = margin.left + index * 210;
    return `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="2.4"/>${dots}<line x1="${legendX}" y1="${margin.top - 30}" x2="${legendX + 24}" y2="${margin.top - 30}" stroke="${color}" stroke-width="2.4"/><text x="${legendX + 31}" y="${margin.top - 25}" class="legend">${name}</text>`;
  }).join("");
  const xTicks = summaries.filter((row) => row.serviceCount % 20 === 0 || row.serviceCount === 10 || row.serviceCount === 250).map((row) =>
    `<text x="${x(row.serviceCount)}" y="${margin.top + plotHeight + 26}" text-anchor="middle" class="tick">${row.serviceCount}</text>`
  ).join("");
  const graphRebuildPresent = summaries.some((row) => row.phases["link.logical.build-implementation-graph"] !== undefined);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Archinsight secondary linker phase timings</title>
  <desc id="description">Non-dominant linker phase times for 10 to 250 services.</desc>
  <style>text{font-family:Arial,Helvetica,sans-serif;fill:#172033}.title{font-size:25px;font-weight:700}.subtitle{font-size:13px;fill:#5b6475}.legend{font-size:11px;fill:#344054}.tick{font-size:11px;fill:#667085}.grid{stroke:#d9deea;stroke-width:1}</style>
  <rect width="100%" height="100%" fill="#f8f9fc"/>
  <text x="${margin.left}" y="34" class="title">Secondary cold-link phases</text>
  <text x="${margin.left}" y="56" class="subtitle">${graphRebuildPresent ? "Dominant per-edge implementation graph rebuild omitted to expose the remaining costs" : "Detailed phase timings after removal of the per-edge implementation graph rebuild"}</text>
  ${grid}${lines}${xTicks}<text x="${margin.left + plotWidth / 2}" y="${height - 16}" text-anchor="middle">Services</text>
</svg>\n`;
}

function phase(row, name) {
  return row.phases[name]?.elapsedMs ?? 0;
}

function niceMaximum(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const normalized = value * 1.05 / magnitude;
  const step = [1, 1.25, 1.5, 2, 2.5, 5, 10].find((candidate) => candidate >= normalized) ?? 10;
  return step * magnitude;
}

function axis(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value.toFixed(0);
}

function median(values) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function logLogExponent(points) {
  const logarithms = points.map(([x, y]) => [Math.log(x), Math.log(y)]);
  const xMean = logarithms.reduce((sum, point) => sum + point[0], 0) / logarithms.length;
  const yMean = logarithms.reduce((sum, point) => sum + point[1], 0) / logarithms.length;
  const numerator = logarithms.reduce((sum, point) => sum + (point[0] - xMean) * (point[1] - yMean), 0);
  const denominator = logarithms.reduce((sum, point) => sum + (point[0] - xMean) ** 2, 0);
  return numerator / denominator;
}

function sequence(minimum, maximum, step) {
  const values = [];
  for (let value = minimum; value <= maximum; value += step) values.push(value);
  return values;
}

function numberAscending(left, right) {
  return left - right;
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
