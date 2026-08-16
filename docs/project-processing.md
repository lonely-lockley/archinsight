# Building and Linking an Insight Project

Archinsight turns a collection of Insight sources into a typed graph before it produces any structural view or diagram. Parsing establishes the meaning of each source, the type system provides the project vocabulary, and linking resolves declarations into one model. Introspection and rendering operate on that linked result rather than reading `.ai` text independently.

The complete flow is:

```text
runtime types + core definitions + project definitions
                         │
                         ▼
                 language snapshot
                         │
architecture sources ────┤
                         ▼
                   linked project
                         │
                         ▼
                  indexed graph
                         │
                  query / selection
                         ▼
                    render graph
                         │
                         ▼
                   Graphviz DOT
                         │
                         ▼
                    SVG or image
```

Diagnostics are produced throughout this flow. They remain associated with the phase and source location that discovered the problem, which allows a caller to present syntax, schema, linking, and rendering failures without flattening them into one generic error.

## Building the language snapshot

The first stage builds the effective language used by the project. Archinsight begins with runtime types such as `Element`, `Edge`, `List`, and `Text`, then merges the built-in core library and the project's definition sources.

The result is a language snapshot containing:

- type definitions and their base types;
- attributes, including list element types and required markers;
- ordinary constructors and their defaults;
- operator constructors, operand constraints, and implementation identifiers;
- enumeration values;
- presentations and presentation extensions.

Type extensions are merged into their targets during this stage. Presentation extensions are applied to their declared presentations, and inherited schemas remain available through the type hierarchy. Declaration order across files does not determine visibility: the complete snapshot is assembled before architecture objects are linked.

Snapshot validation checks the language itself. It detects unknown base or attribute types, duplicate type declarations, constructor collisions, missing constructors on concrete graph types, invalid presentation targets, repeated extensions, and other contradictions in the schema. Architecture sources can be parsed syntactically without a valid snapshot, but they cannot be linked reliably until their vocabulary is coherent.

## Parsing architecture sources

Each context or environment source is parsed with the completed language snapshot. The parser recognizes the indentation structure and records explicit semantic roles such as constructor names, declared identifiers, attribute assignments, imports, operator invocations, and object extensions.

Parsing is performed per source. A syntax problem therefore belongs to the source that contains it and has a precise line and column whenever the offending token can be identified.

The parsed representation preserves source identity. Two files may contribute elements to the same context, while their declarations, imports, relationships, and diagnostics continue to record which source owns them. This information later supports navigation, dependency tracking, and source-scoped views.

## Linking the project

Linking combines parsed architecture sources under the rules of the language snapshot. The process begins by collecting contexts, environments, objects, imports, extensions, attributes, and pending operator invocations.

Objects receive context-qualified identities. Declarations with the same local identifier in one context collide even when they come from different files. Object extensions are applied to their existing targets before the effective elements are validated, so children and relationships introduced by an extension behave as contributions to the original object.

Imports are then resolved into source-local bindings. Attribute references and relationship targets use declarations from the current source, its named imports, or an inline anonymous `from` qualifier. A declaration that exists only in another source of the same context remains unavailable until that source boundary is acknowledged explicitly.

For every object, the linker resolves the constructor to its type and computes the effective attribute schema through inheritance. It validates:

- whether the object is allowed in its current typed slot;
- whether each attribute exists on the resolved type;
- whether scalar, object, reference, and list values have compatible types;
- whether required attributes have values or constructor defaults;
- whether a scalar attribute is assigned more than once;
- whether referenced identifiers and imported targets exist.

Operator invocations are resolved from their source type, target type, and the expected type of the containing list. The selected TypeScript implementation materializes the invocation. For ordinary logical relationships, the result is a typed edge with an explicit source and target. Deployment operations may also resolve profiles, environment capabilities, placements, and projected physical relationships.

After operator execution, projection rules expand the relevant logical elements and edges into deployment-level paths. Projected edges retain their relationship to the originating source, endpoints, annotations, and projection scope. This provenance lets later queries distinguish authored relationships from derived ones.

Finally, presentations are resolved through type inheritance. Each concrete type receives the nearest applicable label mappings, theme values, and Graphviz properties, with its own declaration overriding inherited values.

## The linked project

The linked result is the authoritative domain representation of the project. It contains linked contexts, elements, imports, edges, resolved presentations, diagnostics, and source roots.

A linked element records:

- its context-qualified and local identities;
- resolved type, constructor, and base types;
- parent and source identity;
- scalar and reference attributes;
- declaration location, annotations, and notes.

A linked edge records its source, target, operator, resolved edge type, attributes, and source identity. Derived deployment edges are marked as projected and may carry their projection scope and original endpoints.

The result can remain useful when some declarations contain errors. Successfully resolved elements and relationships are preserved so that an editor or analysis tool can inspect the unaffected part of the project. A result containing an error is not eligible for rendering, because an image produced from an invalid graph could present an incomplete model as authoritative.

## Diagnostics and error discovery

Diagnostics are structured values rather than formatted log strings. Each diagnostic carries a stable code, severity, message, source identity, and source range when the problem belongs to user text.

There are three severities:

- `ERROR` identifies a problem that prevents the affected model from being considered valid.
- `WARNING` identifies a valid but risky or discouraged construction, such as extending one type in several places.
- `NOTE` provides contextual information that does not invalidate the model.

Errors can originate at several layers. Syntax diagnostics describe tokens, indentation, or source forms that the parser could not accept. Snapshot diagnostics describe an inconsistent language definition. Linker diagnostics describe unresolved identifiers, missing imports, type mismatches, invalid nesting, missing required attributes, duplicate assignments, and incompatible operators. Projection diagnostics describe deployment substitutions or paths that cannot be resolved.

Runtime and rendering failures preserve their system-level nature. They should be reported as failures of the relevant operation, with no invented underline on unrelated source text. A real source diagnostic points at the declaration or reference responsible for the problem.

Because later errors may be consequences of an earlier one, diagnostics are most useful when read from the first concrete syntax, type, or resolution failure in the affected source. Fixing that cause often restores enough semantic context for dependent diagnostics to disappear on the next build.

## Indexed graph and introspection

The linker builds an indexed semantic graph alongside the domain collections. This graph contains more than the nodes and arrows shown on an architecture diagram. It represents the structure needed to inspect how the project was assembled.

Its node kinds include:

- contexts and environments;
- source identities;
- type definitions;
- linked architectural elements.

Its relation kinds include:

- `CONTRIBUTES`, connecting a source to its context;
- `DECLARES`, connecting a source to an element it owns;
- `CONTAINS`, connecting a context or parent element to a child;
- `IMPORTS`, recording a source dependency on an imported element;
- `INHERITS`, connecting types through their base hierarchy;
- `REFERENCES`, representing authored and projected architectural edges.

The graph supports project structure views, declaration lookup, type-tree inspection, and incoming and outgoing dependency analysis.

Introspection reads this semantic graph and the linked domain objects. It does not infer project structure again from filenames or text searches. As a result, aliases resolve to their real targets, extensions appear under the object they modify, inherited types participate in type queries, and projected relationships can be distinguished from authored wires.

## Selecting a render graph

The complete indexed graph usually contains more information than one diagram can communicate. A [graph query](graph-queries.md) selects the elements and relationships relevant to a particular architectural question.

Query evaluation receives the linked project and a scope. The scope can identify a context and a selected source. Queries can match graph nodes and relationships, inspect types and attributes, filter results, follow optional relationships, roll lower-level dependencies up to their owners, and group selected elements.

The selection produces a render graph containing:

- the elements that should be visible;
- the edges connecting them;
- groups that should become visual boundaries;
- elements considered external to the selected view.

The render graph is a view of the linked model. Selecting or grouping objects does not modify their identities, ownership, attributes, or relationships. Several views can therefore answer different questions from the same project build.

## Generating Graphviz DOT

DOT generation translates the render graph into a Graphviz directed graph. It is a deterministic formatting stage: graph structure comes from linking and selection, while presentation definitions decide labels, colors, shapes, line styles, and layout hints.

The generator performs several transformations:

- resolved groups become Graphviz clusters;
- selected elements become nodes with stable generated identifiers;
- linked and projected relationships become directed edges;
- `header`, `subtitle`, and `body` mappings read label content from element or edge attributes;
- light or dark presentation sections provide fill, stroke, and text colors;
- `graphviz` presentation properties control shapes and layout;
- elements with `visible = false` are omitted with their incident rendered relationships;
- source locations become navigation metadata where the output format supports it.

The generated DOT is an intermediate representation owned by Archinsight. Users describe architecture and views in Insight; they do not need to maintain a second hand-written DOT model. Keeping DOT generation downstream of linking guarantees that diagrams use the same resolved types, imports, extensions, projections, and diagnostics as every other project view.

DOT generation refuses a linked result containing errors. Warnings and notes remain compatible with rendering because they do not make the graph invalid.

## From DOT to an image

Graphviz receives the generated DOT, calculates node positions and edge routes, and emits a visual format such as SVG or PNG. Archinsight uses the `dot` layout model for directed, hierarchical architecture diagrams.

SVG preserves vector geometry, text, identifiers, links, and navigation metadata, making it suitable for interactive previews and documentation. Raster output is derived from the same generated graph when a fixed image format is required.

Archinsight resolves identifiers, validates types, applies imports, executes operators, and selects the architectural scope before producing DOT. Graphviz then controls the geometric layout and drawing of the completed render graph. The generated image therefore reflects the same linked model as every other project view.
