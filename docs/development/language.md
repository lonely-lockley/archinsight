# Insight Language Development Rules

These rules apply to the Insight grammar, language snapshot, linker, query
language, completion, semantic highlighting, TextMate grammar, and the
language-facing behavior of CLI, web, and VS Code clients.

## Prefer the smallest language mechanism

Solve a modeling need in this order:

1. Use the existing language and type system when they can express the intent.
2. Add or extend declarative types, attributes, capabilities, presentations,
   views, or operators.
3. Change grammar or introduce syntax only when the first two options cannot
   express the required semantics clearly.

Do not add syntax as a shortcut for behavior that can be represented by the
existing model. A syntax change increases the compatibility and tooling
surface across every client.

## Design general contracts

- Implement behavior from parsed structure, type relationships, capabilities,
  and snapshot metadata. Do not dispatch on a built-in type name, constructor
  spelling, operator spelling, view ID, file name, or source layout unless that
  exact value is a documented language contract.
- A project-defined vocabulary with different names must be able to reuse the
  same mechanism as the core vocabulary.
- Keep one semantic rule for parsing, linking, completion, and client adapters.
  Clients must not rediscover language meaning with regular expressions or
  duplicated name lists.
- Resolve overloads and inferred behavior by type specificity and explicit
  metadata. Results must not depend on declaration, source, or merge order.
- Prefer explicit ambiguity diagnostics over silent fallback to a convenient
  built-in type or the first matching candidate.

## Preserve compatibility

- Treat documented Insight syntax and semantics as a public contract. Preserve
  existing valid models whenever reasonably possible.
- Prefer additive snapshot fields, capabilities, and operators over changing
  the meaning of existing constructs.
- If compatibility cannot be preserved, document the break, provide a clear
  diagnostic or migration path, and keep deprecated forms for an intentional
  transition period where practical.
- Test old and new forms together. Do not remove compatibility behavior merely
  because current examples no longer exercise it.

## Completion is semantic behavior

- Completion must derive candidates from types, inheritance, attributes,
  capabilities, operators, and the current syntactic position—not from exact
  names in the core model.
- Use arbitrary project-defined type and constructor names in completion tests.
  A feature is not general if it works only for `System`, `Environment`,
  `Deployment`, or another built-in name.
- The same rule must work at every valid nesting depth. Cover top-level,
  nested, deeply nested, named-slot, and anonymous-slot positions where the
  construct is legal.
- Completion must remain useful while the source is incomplete: test line
  start and end, token boundaries, whitespace, indentation, and EOF-like
  cursor positions.
- Candidate assertions must detect both omissions and leaks. Assert the exact
  candidate set when stable; otherwise assert required candidates and explicit
  forbidden candidates. A test that checks only one expected item is
  insufficient when extra items would be incorrect.
- Linking and completion must use the same type-resolution rules. Do not repair
  completion with a client-only special case.

## Required language test matrix

For object-valued type constructors, always cover all applicable forms:

- the full named form (`constructor identifier`);
- the full anonymous form (`constructor _`);
- the shortened form where the constructor and anonymous identity are inferred.

For each form, cover the happy path and relevant negative paths: no compatible
constructor, several compatible constructors, wrong owner or target type,
invalid nesting, missing candidates, and unexpected extra candidates.

A grammar or semantic change normally needs focused contracts for every
affected stage:

- parsing and recovery from partial or invalid syntax;
- snapshot collection, merge, validation, and serialization;
- linker semantics and exact diagnostic ranges;
- completion at valid and incomplete cursor positions;
- semantic highlighting and TextMate grammar;
- query, rendering, CLI, web, and VS Code behavior where observable;
- backward-compatible legacy forms.

Use small fixtures that prove the general rule, plus existing real models as
regression coverage. Follow [`testing.md`](testing.md) for suite discovery,
negative testing, coverage gates, and the required `./gradlew clean dist`
integration path.
