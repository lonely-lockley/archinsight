# Importing Existing Architecture Models

Use this reference when architecture already exists in another DSL, a diagram,
an inventory, or prose. Import is a semantic reconstruction: the objective is
to preserve supported architecture facts in Insight, not to reproduce the
source file line by line or preserve its drawing coordinates.

## Establish the Source Contract

Before writing Insight, identify which inputs are authoritative and what each
one represents. A repository-wide model may describe ownership and identity;
an individual diagram may be only one filtered view. An infrastructure
inventory can describe deployed resources without explaining logical systems.
Prose can contain facts that are absent from every diagram.

Keep this mapping in an optional import report: a non-semantic Markdown working
artifact that does not participate in Insight parsing, linking, queries, or
rendering. Follow an existing repository convention when one exists; otherwise
use `notes/<scope>-import.md`. The report records:

- source artifact and source identity;
- selected Insight id and type;
- ownership or context mapping;
- evidence supporting the mapping;
- unresolved or contradictory facts;
- defects observed in the source;
- resolution status and any user decision.

Preserve stable source ids when they are meaningful and valid Insight
identifiers. Never merge objects solely because their display names look
similar.

## Separate Import From Repair

Import supported architectural facts faithfully. Finding a defect in an
authoritative source does not authorize silently correcting or redesigning it.
Record contradictions and continue with independent supported facts. If a
source defect cannot be represented in a valid Insight model, keep the
observation in the import report instead of fabricating a valid replacement.
Repair the architecture only when the task explicitly includes repair or the
user chooses a resolution.

## Judge the Evidence, Not Just the Format

Source formats provide different levels of architectural evidence.

PlantUML, Mermaid, and DOT are often used as drawing languages. Their text may
be deterministic enough to reproduce one picture, while architectural identity,
ownership, relationship meaning, and consistency across several diagrams remain
author conventions. Treat a node or arrow found there as an observation from
that diagram. Do not assume that repeated labels identify one object, that a
visual boundary is semantic containment, or that an arrow carries the same
dependency meaning in every file.

LikeC4, Structurizr, and other model-oriented DSLs usually provide more reliable
identities, containment, and directed relationships. Accept facts that are
explicitly encoded in their model, but do not treat the model as complete by
default. A workspace or selected view may omit deployment, lower architectural
levels, external ownership, relationship technology, operational constraints,
or the reason a boundary was chosen. Deterministic input can still be partial
input.

Inventories and generated exports are reliable only for the fields their
producer owns. A cloud inventory can prove that a resource exists and expose
its configuration, but it may say nothing about the logical service using it or
the architectural dependency it realizes.

When required semantics are absent or contradictory, first search the relevant
repository sources, attached artifacts, configured skills, MCP integrations,
and other authorized information sources available to the agent. Prefer the
most authoritative source for the fact and record conflicts instead of silently
choosing one. Do not ask the user to provide information that can be retrieved
reliably through those sources.

Only when the missing fact cannot be obtained independently should the agent
stop that part of the translation and ask the user for context or documentation.
Send one short message with one or two focused questions. Good questions resolve
a specific mapping decision, for example:

- Does `A -> B` represent a runtime call, data flow, or dependency ownership?
- Is this system external to the modeled context, or only outside the current
  diagram's focal system?
- Is this deployment node a concrete resource, a reusable environment slot, or
  a visual grouping?

Continue with independent, well-supported facts while the answer is pending.
Record unresolved mappings instead of selecting the most plausible type,
boundary, direction, or deployment structure.

## Interpret Common Sources Carefully

| Source concept | Likely Insight concept | Required judgment |
| --- | --- | --- |
| C4 person or actor | `Actor` or `ExternalActor` | Decide externality relative to the selected context. |
| C4 software system | `System` or `ExternalSystem` | Confirm ownership and context boundary. |
| C4 container | `Container` or `Service` | Choose the name that best communicates its runtime purpose. |
| C4 component | `Component` | Confirm its owning container or service. |
| C4 code element | Project-defined `CodeElement` descendant | Preserve the source vocabulary and introduce a concrete code type only when the source identifies its meaning and containment. |
| Relationship | Insight wire | Preserve direction, kind, technology, and the object that owns the dependency. |
| Deployment node or resource | Environment, deployment, or infrastructure component | Separate a reusable deployment scheme from a concrete resource instance. |
| Diagram boundary | Context, owner, group, or query scope | A visual box alone does not prove semantic containment. |

LikeC4, Structurizr, and other C4-oriented DSLs usually provide the closest logical mapping,
but their deployment instances and views still do not map mechanically to
Insight profiles and projections. Mermaid, PlantUML, and DOT often provide
visible nodes and arrows while omitting type, ownership, context, and deployment
semantics. YAML, JSON, and cloud inventories provide structure but do not make
field names architectural facts. Apply the evidence rules above and ask for
missing semantics instead of deriving them from visual placement or
serialization shape.

## Import Outside In

1. Inventory the source objects, relationships, boundaries, and views without
   editing them.
2. Define the Insight context boundary and shared external contexts.
3. Create project-specific definitions only when the source has a real reusable
   concept that the built-in type system does not express.
4. Import C1 actors, systems, and their highest-level relationships. Link the
   project and resolve identity or ownership errors.
5. Add C2 containers and services, then move relationships to the lowest known
   logical endpoints so built-in rollup can produce higher-level views.
6. Add C3 components only where the source provides component-level evidence.
7. If C4 is in scope, first inspect the repository for existing `CodeElement`
   descendants and containment slots. Reuse that vocabulary without asking. Ask
   the user which entity kinds to model only when the project has no Code layer
   or the import requires extending its vocabulary, unless the request already
   makes that choice. Add code elements only where the source identifies their
   containment and dependencies.
8. Build deployment models separately from concrete environments and deployments. Use
   profiles, `runsOn`, `uses`, and projections to map the logical model to
   physical infrastructure; do not turn every deployment node into a logical
   C2 element.
9. Split definitions, contexts, and environments into valid source roles and
   make cross-file visibility explicit with imports.

For a normal synchronous wire, the element that owns the dependency declares
the wire and the arrow points from that owner to its target. Async pub/sub can
use consumer-owned dependencies as described in `references/modeling.md`.
Preserve source direction unless the target architecture semantics explicitly
require a different ownership model, and record that decision.

## Reconcile the Result

Validate each imported layer rather than translating the complete source before
the first link:

```shell
archinsight link . --format text
archinsight structure . --format json
archinsight query . -c <context-id> -v no-filter --format json
```

Use C1, C2, C3, C4, and Deployment query JSON to compare the intended scope and
relationships at each level. Counts can reveal omissions, but equal counts do
not prove semantic equivalence. Compare qualified identities, types, ownership,
wire direction, externality, and deployment projection. Keep unresolved source
facts visible in the import report instead of fabricating declarations to make
the model appear complete.
