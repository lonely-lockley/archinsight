import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILTIN_VIEW_DEFINITIONS,
  DEFAULT_QUERY_EXECUTION_LIMITS,
  ProjectAnalysisSession,
  executeQuery,
} from "../build/runtime/index.js";
import { minimumExpansionBudget } from "./query-expansion-budget.mjs";

const benchmark = new URL("../../../benchmarks/link-scaling/", import.meta.url);
const tab = "contexts/context_039/service-250/model.ai";
const measure = process.argv.includes("--measure");
const baseline = measure ? {} : JSON.parse(readFileSync(new URL("query-expansion-baseline.json", benchmark), "utf8"));
if (!measure) {
  assert.deepEqual(Object.keys(baseline).sort(), BUILTIN_VIEW_DEFINITIONS.map((view) => view.id).sort(),
    "Every built-in query needs a reviewed expansion baseline. Run this contract with --measure.");
}

const result = linkCompany();
const measurements = {};
const failures = [];
for (const view of BUILTIN_VIEW_DEFINITIONS) {
  const scope = { view: view.id, context: "context_039", tab };
  if (view.environment === "single-relevant") scope.environment = "env_01";
  const run = (maxExpansions) => {
    const query = executeQuery(result, scope, view.query, {}, { limits: { maxExpansions, timeoutMs: Number.MAX_SAFE_INTEGER } });
    assert.equal(query.kind, "graph");
    assert(Object.keys(query.graph.elements).length && query.graph.edges.length, `${view.id} must exercise a nonempty graph with edges`);
  };
  try {
    const maximum = DEFAULT_QUERY_EXECUTION_LIMITS.maxExpansions;
    if (measure) {
      measurements[view.id] = minimumExpansionBudget(run, maximum);
    } else {
      const reference = baseline[view.id];
      assert(Number.isSafeInteger(reference) && reference > 0, `Invalid expansion baseline for ${view.id}`);
      run(Math.min(maximum, Math.floor(reference * 13 / 10)));
    }
  } catch (error) {
    failures.push(`${view.id} (baseline ${baseline[view.id] ?? "unmeasured"}): ${error.message}`);
  }
}
assert.equal(failures.length, 0, `${failures.join("\n")}\nInvestigate the failing query before changing its baseline.`);
if (measure) console.log(JSON.stringify(measurements, null, 2));

function linkCompany() {
  const directory = mkdtempSync(join(tmpdir(), "archinsight-query-cost-"));
  let sources;
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL("generate-repository.mjs", benchmark)), "--output", directory]);
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    sources = manifest.files.map((file) => ({
      sourceName: file.path,
      source: readFileSync(join(directory, file.path), "utf8"),
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  sources.push({ sourceName: "query-types.ai", source: `
define type Module of CodeElement
    constructor module
    required Text name
    List of Wire links

extend type Component
    List of Module _
` });
  // Widen the open tab for D1 and give C4 a real code-level relationship.
  const model = sources.find((source) => source.sourceName === tab);
  assert(model, `Missing synthetic query tab ${tab}`);
  model.source += `
    service query_worker
        name = Query worker
        deployment:
            uses service_250_stateless
        links:
            -> api_249
                deployment:
                    route serviceCall

        component query_engine
            name = Query engine
            module parser
                name = Parser
                links:
                    -> evaluator
            module evaluator
                name = Evaluator

    service query_observer
        name = Query observer
        deployment:
            uses service_250_stateless
`;
  const analysis = ProjectAnalysisSession.create(sources).analysis();
  assert.deepEqual(analysis.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
  return analysis.result;
}
