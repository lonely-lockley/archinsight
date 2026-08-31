# UI Development Rules

These rules apply to human contributors and coding agents changing UI code in
`archinsight-web`. They exist to prevent the workspace from becoming a single
stateful page again.

## Architecture

Organize workspace code by feature. A feature may contain its Svelte
components, controller, pure model, infrastructure ports, and focused tests.
Do not group unrelated behavior into a generic page-level `utils`, `services`,
or global store module.

Dependencies flow in one direction:

```text
component -> controller -> infrastructure port
          <- view model / feature state
```

- Components render data and emit user intent. They do not call application
  HTTP APIs or browser storage directly.
- Controllers own use cases and asynchronous coordination. External behavior
  is supplied through explicit dependencies.
- Pure models own deterministic state transitions and must not depend on
  Svelte, DOM globals, Monaco, workers, HTTP, or storage.
- Adapters own browser, Monaco, worker, Graphviz, HTTP, and storage integration.
- Route files select policy and compose features; they do not implement feature
  behavior.

Keep one shared workspace core for Editor and Playground. Express differences
through `surface`, capabilities, and tested policy. Do not fork the workspace
into independent Editor and Playground implementations.

Do not create module-global mutable workspace state. Every mounted workspace
and every test must receive an isolated state/controller instance.

## When to extract a feature

Do not add behavior to the page component when it introduces any of the
following:

- a new asynchronous workflow;
- state with its own lifecycle or invariants;
- direct use of API, storage, Monaco, worker, or browser APIs;
- several handlers operating on the same state;
- a visual block with an independent interaction contract.

Create or extend the responsible feature slice instead. File size is a warning,
not a mechanical limit: investigate a Svelte component approaching 300 lines
or a controller approaching 400 lines for mixed responsibilities. A larger
file is acceptable only when it remains cohesive and its behavior is directly
testable.

Avoid large prop lists. Prefer a cohesive typed view model plus explicit event
callbacks, but do not hide unrelated dependencies inside an untyped context or
service locator.

## Testing

Every UI behavior change needs tests at the narrowest reliable boundary:

- pure model tests for state transitions, validation, normalization, and
  negative cases;
- component tests for rendering, accessibility state, and emitted user intent;
- controller tests with fake ports for success, failure, cancellation, stale
  responses, and partial completion;
- real-browser smoke tests for Monaco, workers, focus/keyboard behavior, layout,
  and critical Editor/Playground workflows.

Bug fixes require a regression test that fails for the original behavior.
Avoid whole-page DOM snapshots. Assert visible behavior and stable contracts.

All UI tests must run through the package `check` task and therefore through:

```text
./gradlew clean dist
```

Coverage may not fall below the exact counters in
`test-coverage-baseline.json`. New source files are part of the measured scope.

## Styling

Move scoped styles together with the markup they own. Parent Svelte styles do
not automatically apply inside an extracted child component.

Keep only reset rules, tokens, and genuinely shared layout primitives in global
CSS. Do not fix extraction-related scoping problems by moving an entire
component stylesheet into global CSS. Preserve keyboard focus, accessible
names, disabled states, and responsive constraints during extraction.

## Refactoring discipline

Refactor incrementally. In one step, do not combine structural extraction with
visual redesign, behavior changes, API changes, or migration between Svelte
reactivity styles.

Before moving sensitive behavior, add characterization tests. After each
extraction, run focused tests and the coverage gate. At completed milestones,
run `./gradlew clean dist`.
