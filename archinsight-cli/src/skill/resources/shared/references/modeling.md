# Modeling Guidance

Insight syntax is small; most mistakes are modeling mistakes. Decide the view
question before changing files.

## Separate Definitions From Model Sources

Keep language/framework definitions separate from graph model files.

- Definition/framework files contain `define type`, `define operator`,
  `define enum of`, `define presentation`, `extend type`,
  `extend enum of`, and `extend presentation`.
- Context files begin with `context <id>` and describe logical architecture.
- Environment files begin with exactly one `environment <id>`, followed by
  one or more concrete deployments and their infrastructure inventory.

Each source has one role. Do not mix definitions, a context, and an environment
in one file. Put shared vocabulary in framework files, logical objects and
context-owned deployment profiles in context files, and concrete infrastructure
in environment files. This keeps schema changes reviewable and avoids
source-level syntax failures.

## Model Source Granularity

Default to one primary owned system per model source file: the system you are
about to detail with containers, services, components, code, and deployment
relationships. This keeps the selected source file useful as a C2, C3, C4, or
Deployment view scope and avoids accidental mega-files.

Do not create one file per external actor or external system. Shared external
dependencies are usually better modeled once in a reusable external context, or
in a few external contexts grouped by meaning such as `external_platforms`,
`partners`, or `regulators`. Import those shared declarations from system
files that need them.

If a user asks for deeper splitting, use `extend <object>` files for the
detail being extracted. For example, keep the main service file readable and put
large per-service component sets in a small utility subdirectory for that
context.

## Projections Are Bottom-Up

Built-in C1, C2, C3, C4, and Deployment views are selected from the linked model.
They are not separate diagrams to author by hand.

- C1 is context-oriented and can aggregate lower-level relationships upward.
- C2, C3, C4, and Deployment are usually scoped by the selected source file through
  `--source` / `$tab`.
- A file often has one focal system, container, or deployment slice for the view
  it is meant to render, but the exact scope is determined by the query used for
  visualization.
- Do not try to reconstruct a deeper view from a broader one. C1 carries too
  little information to recreate C2, C3, or C4 details.

If an element is missing from a C2, C3, C4, or Deployment render, first check the query, selected
source file, and relationship level before assuming the model is wrong.

## Keep Relationship Levels Deliberate

Avoid mixing system-level links with leaf-level links in the same view question.
For C2/C3-style views, prefer links between the actual leaves being shown:
containers, services, components, actors, or opaque external systems.

Allowed cross-level links depend on the query and type model. A common C2 pattern
is a current-system container/service linking to an external system. Owned
`system` elements are usually aggregate nodes for C1, not C2 leaves.

## Externality Depends on Scope

Do not blindly turn every peer into `external system`.

- A system can be external to the current system but still owned in the current
  context.
- A system can be external to the current context, such as a vendor, regulator,
  or platform outside the modeled boundary.
- Reusable outside systems can live in a separate context and be imported where
  needed.
- Imported relationships and the linked model can determine external relations;
  use validation and structure inspection instead of duplicating declarations.

Choose the boundary first: current system, current context, or outside context.
Then choose `system`, `external system`, or an import.

## Let the Type Tree Decide Nesting

Do not memorize only built-in entity names. Users can extend the language with
custom types.

Use `archinsight structure . --format text` and `.core/*.ai` to inspect the
type hierarchy:

- `Context` contains `BoundaryElement`.
- Built-in actors and systems are `SystemElement` / `BoundaryElement` types,
  so they live at context level.
- Built-in containers/services live under systems because `System` declares
  `List of Container _`.
- Components live where the relevant container/service type allows them.
- Project-defined code types derive from `CodeElement` and live where the
  project framework exposes compatible component or code-element slots.
- Custom project types can change the available constructors and allowed child
  slots; inspect them before writing.

If a nested declaration fails type checking, fix the type/ownership model rather
than forcing a link or inventing a wrapper element.

## Choose Infrastructure Depth Per System

Do not force every project into deployment on the first pass. Most modeling
work can proceed through C1-C3 without asking about deployment depth. When the
task first touches infrastructure, runtime placement, regions, compute, brokers,
gateways, storage, or deployment, ask the user or infer from the repository
whether the affected system needs a pragmatic mixed C2 view or a clean
deployment model.

Pragmatic mixed C2 is fast: model databases, brokers, gateways, or secret stores
next to services when the user wants a quick single-environment diagram. The
cost is that C2 now mixes logical containers with infrastructure, and a
separate Deployment view is effectively absent for that system.

Explicit deployment modeling keeps C2 logical and moves physical realization
into concrete deployments, context-owned deployment profiles, inventory slots,
and projection rules. This is more work up front, but it supports many-to-many
deployment: one logical service can target several concrete deployments whose
infrastructure differs by stage, region, provider, or organizational boundary.

This choice is per-system, not global. A critical system can use explicit
deployment modeling while peripheral systems stay pragmatic in C2. Starting
cheap is acceptable, but upgrading mixed C2 infrastructure into explicit
deployment modeling is a migration, not just an extra attribute.

## Eventing

Use `~>` for asynchronous relationships. Model one async wire per meaningful
topic or event flow between real producer and consumer elements.

For pub/sub, make the dependency consumer-owned:

- The producer/source declares the event topic as part of its contract, but does
  not maintain a manual list of subscribers.
- The consumer declares `~> producer` with `via = <topic>`, because the
  consumer depends on the producer's event contract.
- To answer "who depends on this event?", query the graph for incoming async
  dependencies instead of editing a subscriber list on the producer.

Do not invent a broker node just to make the diagram look familiar. If the
chosen style is explicit deployment modeling, inventory records that a concrete
broker exists, but inventory alone does not place an async logical wire in the
Deployment view. The wire must select an environment slot whose concrete value
has a projection.

A wire can use only a `NetworkConnection` descendant. The built-in `Broker`
is one, so an environment can expose a `Broker` slot directly and a wire can
select it with `uses`. Derive product-specific types such as Kafka or RabbitMQ
from `Broker`, then put the physical path projection on the concrete broker
instance. Read the complete [Broker](deployment-projections.md#broker) example
before modeling that path.

If the chosen style is pragmatic mixed C2, a broker-like node can be acceptable,
but document that the view mixes levels. If the producer or consumer is not
known, leave a gap and report it instead of fabricating an element.

## No Fabricated Elements

Every element should have a real architectural referent. If a relationship has
no legitimate endpoint in scope, flag the uncertainty and ask for the missing
boundary or owner.
