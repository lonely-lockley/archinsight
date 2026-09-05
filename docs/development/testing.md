# Testing Policy

This guide defines the repository-wide test contract. A change is complete
only when the authoritative check for every affected package passes. The normal
test path must be hermetic: it may not require PostgreSQL, Docker, Kubernetes,
the internet, developer credentials, or a particular execution order.

## Authoritative checks

The complete release verification entrypoint is:

```shell
./gradlew clean dist
```

`dist` depends on the root `check`, and the root check depends on every package
check. Test tasks deliberately remain part of every `clean dist` invocation;
distribution artifacts must never be produced from type/build checks alone.
Use `./gradlew check` when only verification is needed without rebuilding all
distribution and container artifacts.

After the package checks finish, Gradle prints one consolidated coverage table
with the current percentage and percentage-point delta from the committed
baseline. It reuses reports from the same build and does not rerun tests.

Each package also has one authoritative local command:

| Area | Command | What it enforces |
| --- | --- | --- |
| Insight language | `npm --prefix packages/insight-language run check` | typecheck, all runtime contracts, coverage gate |
| CLI and generated skill | `npm --prefix archinsight-cli run check` | production build, all CLI/skill contracts, coverage gate |
| Web | `npm --prefix archinsight-web run check` | Svelte/TypeScript checks, every Vitest test, coverage gate |
| VSCode | `npm --prefix archinsight-vscode run check` | typecheck, extension/webview build, manifest contracts |
| Renderer | `npm --prefix archinsight-renderer run check` | all service tests, coverage gate |

Focused commands such as `test:server`, `test:security`, `test:ui`, `test:cli`,
and `test:skill` are development conveniences. They never replace the package
`check` command.

## Coverage non-regression rule

The measured baseline is stored in
[`test-coverage-baseline.json`](test-coverage-baseline.json). Language, CLI,
web, and renderer checks collect V8 coverage and compare the exact
`covered / total` ratio for lines, branches, functions, and statements. No
metric in an affected package may fall below its baseline after a change.

The current baseline is:

| Area | Lines | Branches | Functions | Statements |
| --- | ---: | ---: | ---: | ---: |
| Language | 92.31% | 85.83% | 96.03% | 92.31% |
| CLI | 95.26% | 77.10% | 87.27% | 95.26% |
| Web | 54.50% | 78.85% | 86.44% | 54.50% |
| Renderer | 89.89% | 86.11% | 95.74% | 89.89% |

Coverage output lives in package-local `coverage/` directories and is not
committed. Generated parser sources, declarations, static themes, and generated
version metadata are excluded because they are not independently maintained
behavior. Do not widen exclusions to make a check pass.

The baseline may change only in a reviewed change that explains why its scope
or denominator changed. Never lower or regenerate it merely to turn a failed
gate green. Prefer adding a missing behavior test. New production modules must
be included in coverage from their first change.

VSCode currently enforces manifest smoke contracts but has no honest numeric
runtime baseline: those tests inspect package contributions and registrations
without executing the extension. Extracted pure modules must receive direct
tests and coverage; extension lifecycle, editor events, messaging, and disposal
need an extension-host or injected-adapter harness before VSCode coverage can be
gated. This limitation is recorded explicitly in the baseline rather than
reporting a misleading percentage.

## Test layers

Use the smallest layer that proves the behavior:

1. **Unit tests** cover pure transformations, validators, selectors, and state
   transitions with local inputs.
2. **Contract tests** cover a public language rule, CLI command, API boundary,
   adapter, or extension contribution. Assert observable results, not internal
   call sequences.
3. **Integration tests** connect a small number of real in-process components.
   Replace databases, authentication, clocks, rendering processes, and network
   clients at a narrow boundary unless their integration is the subject.
4. **Security tests** exercise hostile input, trust boundaries, sanitization,
   authorization isolation, traversal, and resource limits.
5. **Smoke tests** prove one representative product flow across broad layers.
   Keep them few and separate from focused regression tests.

Every behavior family should make its dimensions visible. At minimum consider:

- one normal happy path;
- malformed, missing, forbidden, or conflicting input;
- empty, minimum, maximum, boundary, and EOF-like positions;
- duplicates, ordering, and idempotence;
- concurrency and isolation when shared state or caching is involved;
- exact absence of forbidden output, not only presence of expected output.

Do not create artificial `happy/` and `negative/` directory trees. Keep both
sides close to the feature, name cases by the contract they prove, and use
nested suites or table-driven cases when the same setup has a genuine input
matrix. A bug fix starts with a focused test that fails for the reported reason.

## Discovery and naming

Tests must be discovered automatically by the authoritative suite. Adding a
test file must not require editing a second manual manifest.

- Language and CLI executable contracts use `scripts/*-contracts.mjs`. Their
  suite runners discover the files. Language runtime also includes its named
  snapshot, completion-golden, and parser-failure checks.
- Web tests use `*.test.ts` next to the production boundary. Tests needing DOM
  globals declare `// @vitest-environment happy-dom`; the default remains Node
  for server tests.
- Renderer tests use `test/*.test.mjs` and Node's test runner.
- VSCode smoke/contract tests use `test/*.test.mjs`. Pure extracted modules
  should use the runner appropriate to their source language and join `check`.

A test name should identify the condition and externally visible result. Avoid
names such as `works`, `test 1`, or implementation method names that do not
explain the contract.

## Fixtures and helpers

Keep the smallest explanatory fixture beside the behavior it protects. Share a
fixture builder only when it expresses stable domain vocabulary for the same
behavior family. Mutable shared fixtures, hidden global setup, timing sleeps,
and dependence on test order are forbidden.

Large historical Insight models are valuable regression fixtures for parsing,
linking, imports, extension, grouping, and rendering. Keep them in an explicit
regression/smoke layer; they supplement rather than replace a small reproduction
that makes a failure diagnosable.

Golden files are appropriate when the complete output is the contract. Their
update must be reviewed as a behavior change, and important invariants should
still have targeted assertions so a large diff has an understandable cause.

## Area-specific contracts

### Insight language

Language behavior is a pipeline contract. A syntax change normally needs cases
for parser/syntax context, snapshots, linker/runtime semantics, diagnostic
ranges, completion in partial editing states, and query/render effects where
relevant. Cover both a valid form and recovery from incomplete or invalid input.

Completion tests must probe word/token boundaries, whitespace, indentation,
line start/end, and EOF-like positions. Diagnostics assert the exact offending
token range. Source-scoped view changes cover a source rooted at the view
boundary and a source below it through `extend`.

Deployment changes cover D1 (`deployment-system`), D2
(`deployment-container`) in an explicit environment, and legacy `deployment`
when compatibility is affected. Include sync/async wires, multi-hop and
parallel projections, multiple environments, unrelated infrastructure, and
exact node/edge sets.

### CLI and generated skill

Exercise the built CLI as a black box wherever practical. Assert exit status,
stdout, stderr, filesystem effects, refusal before mutation, and cleanup after
failure. Maintain compact success/error matrices for every public command and
option family. Tests for generated skill prose are contract tests for shipped
content, but may not substitute for command behavior tests.

### Web

Server tests cover authentication/authorization, owner and project isolation,
validation, status/error mapping, persistence boundaries, concurrency, and
cache immutability. Databases and identity providers stay mocked in the normal
suite; optional real-database verification belongs in an explicitly named
integration command.

UI tests cover user-visible state and interaction: loading, empty, success,
failure, keyboard/pointer behavior, accessibility semantics, and stale or
concurrent updates. Prefer component tests for controller logic and a small
number of browser smoke flows for editor-to-diagram integration. Sanitizer and
renderer tests treat SVG/HTML as hostile input and assert forbidden content is
absent.

### VSCode

Manifest tests keep contributed commands, activation events, menus, views,
languages, grammars, icons, and registrations consistent. Runtime tests should
inject or host the VSCode API and cover activation/deactivation, command
registration, workspace/document events, diagnostics, completion, webview
message schemas, cancellation, and disposal. Shared webview behavior remains
covered in the web package; extension-specific message wiring belongs here.

### Renderer

Unit-test input validation, subprocess arguments, response mapping, and limits.
HTTP tests cover success, malformed requests, content types, oversized input,
timeouts, child-process failure, and graceful shutdown. Tests must use an
isolated server lifecycle and release ports and child processes on every path.

## Review checklist

For every production change, reviewers should be able to answer yes to these
questions:

- Does the test fail if the new behavior is removed or the bug returns?
- Are the happy, negative, and relevant boundary paths visible?
- Are absence and isolation invariants asserted where applicable?
- Is the test deterministic and independent of developer infrastructure?
- Is the new file automatically part of the package and root checks?
- Do all four coverage ratios stay at or above the recorded baseline?
- Is a broad smoke test backed by a focused diagnostic reproduction?
