#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repository = path.join(benchmarkRoot, "generated", "company-250");
const resultsDirectory = path.join(benchmarkRoot, "results");
const worker = path.join(benchmarkRoot, "benchmark-worker.mjs");
const options = parseArguments(process.argv.slice(2));
const trials = options.trials ?? 3;
const counts = sequence(options.min ?? 10, options.max ?? 250, 10);

if (!Number.isInteger(trials) || trials < 1) throw new Error("--trials must be a positive integer");
if (counts.length === 0 || counts.some((count) => count < 10 || count > 250)) {
  throw new Error("--min and --max must select service counts between 10 and 250");
}

await mkdir(resultsDirectory, { recursive: true });

let runs;
let metadata;
if (options.renderOnly) {
  ({ runs, metadata } = JSON.parse(await readFile(path.join(resultsDirectory, "raw.json"), "utf8")));
} else {
  await ensureRuntimeBuild();
  await ensureRepository();
  runs = [];
  for (const serviceCount of counts) {
    process.stderr.write(`[link-scaling] ${serviceCount} services`);
    for (let trial = 1; trial <= trials; trial += 1) {
      const measurement = await runWorker(serviceCount);
      runs.push({ trial, ...measurement });
      process.stderr.write(`  ${measurement.elapsedMs.toFixed(1)} ms / ${mib(measurement.peakRssBytes).toFixed(1)} MiB`);
    }
    process.stderr.write("\n");
  }
  metadata = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    trialsPerExperiment: trials,
    serviceCounts: counts,
    measurement: "Fresh Node.js process per trial; file reads and module loading excluded from elapsed linking time",
  };
  await writeFile(
    path.join(resultsDirectory, "raw.json"),
    `${JSON.stringify({ metadata, runs }, null, 2)}\n`,
    "utf8",
  );
}

const measuredCounts = metadata.serviceCounts;
const summaries = measuredCounts.map((serviceCount) => summarize(
  runs.filter((run) => run.serviceCount === serviceCount),
));
await writeFile(path.join(resultsDirectory, "summary.csv"), summaryCsv(summaries), "utf8");
await writeFile(path.join(resultsDirectory, "scaling.svg"), scalingSvg(summaries, metadata), "utf8");
await writeFile(path.join(resultsDirectory, "REPORT.md"), reportMarkdown(summaries, metadata), "utf8");

console.log(JSON.stringify({
  experiments: summaries.length,
  trialsPerExperiment: trials,
  resultsDirectory,
  fullScale: summaries.at(-1),
}, null, 2));

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

function runCommand(command, arguments_, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
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

function summarize(experimentRuns) {
  const first = experimentRuns[0];
  const elapsed = experimentRuns.map((run) => run.elapsedMs).sort(numberAscending);
  const peakRss = experimentRuns.map((run) => run.peakRssBytes).sort(numberAscending);
  const rssDelta = experimentRuns.map((run) => run.peakRssBytes - run.rssBeforeBytes).sort(numberAscending);
  return {
    serviceCount: first.serviceCount,
    sourceCount: first.sourceCount,
    sourceLines: first.sourceLines,
    sourceMiB: first.sourceBytes / 1024 / 1024,
    elements: first.elements,
    edges: first.edges,
    contexts: first.contexts,
    diagnostics: first.diagnostics,
    medianMs: median(elapsed),
    minMs: elapsed[0],
    maxMs: elapsed.at(-1),
    medianPeakRssMiB: mib(median(peakRss)),
    minPeakRssMiB: mib(peakRss[0]),
    maxPeakRssMiB: mib(peakRss.at(-1)),
    medianLinkRssDeltaMiB: mib(median(rssDelta)),
  };
}

function summaryCsv(summaries) {
  const headers = Object.keys(summaries[0]);
  return `${headers.join(",")}\n${summaries.map((row) => headers.map((header) => csvValue(row[header])).join(",")).join("\n")}\n`;
}

function reportMarkdown(summaries, metadata) {
  const first = summaries[0];
  const last = summaries.at(-1);
  const timeSlope = linearSlope(summaries.map((row) => [row.serviceCount, row.medianMs]));
  const memorySlope = linearSlope(summaries.map((row) => [row.serviceCount, row.medianPeakRssMiB]));
  const table = summaries.map((row) =>
    `| ${row.serviceCount} | ${row.sourceCount} | ${row.elements} | ${row.edges} | ${row.medianMs.toFixed(1)} | ${row.medianPeakRssMiB.toFixed(1)} | ${row.medianLinkRssDeltaMiB.toFixed(1)} |`
  ).join("\n");
  return `# Cold link scaling results

Generated: ${metadata.generatedAt}

Host: ${metadata.cpu}, ${metadata.logicalCpuCount} logical CPUs, ${(metadata.totalMemoryBytes / 1024 / 1024 / 1024).toFixed(1)} GiB RAM, ${metadata.node}, ${metadata.platform}/${metadata.architecture}.

Each point is the median of ${metadata.trialsPerExperiment} independent cold links in fresh Node.js processes. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate incremental footprint.

![Link scaling](scaling.svg)

## Summary

- Full scale (${last.serviceCount} services): ${last.sourceCount} files, ${last.sourceLines.toLocaleString("en-US")} lines, ${last.elements.toLocaleString("en-US")} linked elements, ${last.edges.toLocaleString("en-US")} linked edges.
- Median cold link time grows from ${first.medianMs.toFixed(1)} ms to ${last.medianMs.toFixed(1)} ms.
- Median peak RSS grows from ${first.medianPeakRssMiB.toFixed(1)} MiB to ${last.medianPeakRssMiB.toFixed(1)} MiB.
- Ordinary least-squares slope across all points: ${timeSlope.toFixed(2)} ms/service and ${memorySlope.toFixed(2)} MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median link, ms | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
`;
}

function scalingSvg(summaries, metadata) {
  const width = 1200;
  const height = 760;
  const margin = { left: 86, right: 40, top: 100, bottom: 62 };
  const gap = 78;
  const panelHeight = (height - margin.top - margin.bottom - gap) / 2;
  const plotWidth = width - margin.left - margin.right;
  const xMin = summaries[0].serviceCount;
  const xMax = summaries.at(-1).serviceCount;
  const timeMax = niceMaximum(Math.max(...summaries.map((row) => row.maxMs)));
  const rssMax = niceMaximum(Math.max(...summaries.map((row) => row.maxPeakRssMiB)));
  const x = (value) => margin.left + (value - xMin) / (xMax - xMin) * plotWidth;
  const y = (value, top, maximum) => top + panelHeight - value / maximum * panelHeight;
  const topTime = margin.top;
  const topMemory = margin.top + panelHeight + gap;
  const timePath = polyline(summaries, (row) => x(row.serviceCount), (row) => y(row.medianMs, topTime, timeMax));
  const rssPath = polyline(summaries, (row) => x(row.serviceCount), (row) => y(row.medianPeakRssMiB, topMemory, rssMax));
  const grid = (top, maximum) => Array.from({ length: 6 }, (_, index) => {
    const value = maximum * index / 5;
    const ordinate = y(value, top, maximum);
    return `<line x1="${margin.left}" y1="${ordinate}" x2="${width - margin.right}" y2="${ordinate}" class="grid"/><text x="${margin.left - 14}" y="${ordinate + 5}" text-anchor="end" class="tick">${formatAxis(value)}</text>`;
  }).join("");
  const xTicks = summaries.filter((row) => row.serviceCount % 20 === 0 || row.serviceCount === xMin || row.serviceCount === xMax).map((row) => {
    const abscissa = x(row.serviceCount);
    return `<line x1="${abscissa}" y1="${topMemory + panelHeight}" x2="${abscissa}" y2="${topMemory + panelHeight + 7}" class="axis"/><text x="${abscissa}" y="${topMemory + panelHeight + 28}" text-anchor="middle" class="tick">${row.serviceCount}</text>`;
  }).join("");
  const dots = (accessor, top, maximum, color) => summaries.map((row) =>
    `<circle cx="${x(row.serviceCount)}" cy="${y(accessor(row), top, maximum)}" r="3.4" fill="${color}"/>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Archinsight cold link scaling</title>
  <desc id="description">Median cold link time and peak resident memory for 10 through 250 services in increments of 10.</desc>
  <style>
    text { font-family: Arial, Helvetica, sans-serif; fill: #172033; }
    .title { font-size: 25px; font-weight: 700; }
    .subtitle { font-size: 13px; fill: #5b6475; }
    .panel { font-size: 16px; font-weight: 650; }
    .tick { font-size: 11px; fill: #667085; }
    .axis { stroke: #667085; stroke-width: 1; }
    .grid { stroke: #d9deea; stroke-width: 1; }
  </style>
  <rect width="100%" height="100%" fill="#f8f9fc"/>
  <text x="${margin.left}" y="34" class="title">Cold linker scaling: synthetic 15-environment company</text>
  <text x="${margin.left}" y="56" class="subtitle">Median of ${metadata.trialsPerExperiment} fresh-process trials at each +10 service step · ${escapeXml(metadata.cpu)}</text>
  <text x="${margin.left}" y="${topTime - 18}" class="panel">Link time (ms)</text>
  ${grid(topTime, timeMax)}
  <line x1="${margin.left}" y1="${topTime + panelHeight}" x2="${width - margin.right}" y2="${topTime + panelHeight}" class="axis"/>
  <path d="${timePath}" fill="none" stroke="#2563eb" stroke-width="2.5"/>
  ${dots((row) => row.medianMs, topTime, timeMax, "#2563eb")}
  <text x="${margin.left}" y="${topMemory - 18}" class="panel">Peak RSS (MiB)</text>
  ${grid(topMemory, rssMax)}
  <line x1="${margin.left}" y1="${topMemory + panelHeight}" x2="${width - margin.right}" y2="${topMemory + panelHeight}" class="axis"/>
  <path d="${rssPath}" fill="none" stroke="#0f9f6e" stroke-width="2.5"/>
  ${dots((row) => row.medianPeakRssMiB, topMemory, rssMax, "#0f9f6e")}
  ${xTicks}
  <text x="${margin.left + plotWidth / 2}" y="${height - 16}" text-anchor="middle" class="panel">Services</text>
</svg>\n`;
}

function polyline(rows, x, y) {
  return rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(row).toFixed(2)},${y(row).toFixed(2)}`).join(" ");
}

function niceMaximum(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value * 1.05 / magnitude;
  const step = [1, 1.25, 1.5, 2, 2.5, 5, 10].find((candidate) => candidate >= normalized) ?? 10;
  return step * magnitude;
}

function formatAxis(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : value.toFixed(value < 10 ? 1 : 0);
}

function linearSlope(points) {
  const xMean = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point[0] - xMean) * (point[1] - yMean), 0);
  const denominator = points.reduce((sum, point) => sum + (point[0] - xMean) ** 2, 0);
  return numerator / denominator;
}

function median(values) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function sequence(minimum, maximum, step) {
  const values = [];
  for (let value = minimum; value <= maximum; value += step) values.push(value);
  return values;
}

function numberAscending(left, right) {
  return left - right;
}

function mib(bytes) {
  return bytes / 1024 / 1024;
}

function csvValue(value) {
  return typeof value === "number" ? String(value) : `"${String(value).replaceAll('"', '""')}"`;
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parseArguments(arguments_) {
  const parsed = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--trials") parsed.trials = Number(requiredValue(arguments_, ++index, argument));
    else if (argument === "--min") parsed.min = Number(requiredValue(arguments_, ++index, argument));
    else if (argument === "--max") parsed.max = Number(requiredValue(arguments_, ++index, argument));
    else if (argument === "--render-only") parsed.renderOnly = true;
    else throw new Error(`Unknown argument '${argument}'`);
  }
  return parsed;
}

function requiredValue(arguments_, index, option) {
  const value = arguments_[index];
  if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}
