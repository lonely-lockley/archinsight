# Archinsight Documentation

Archinsight is a toolkit for describing software architecture as code. Models written in the typed Insight language are linked into a project graph used for validation, navigation, architectural queries, and diagram generation.

## Contents

- [The Insight Language](language.md) introduces names, types, constructors, text values, attributes, enumerations, operators, extensions, and presentations.
- [Comments and Notes](comments-and-notes.md) explains standalone source comments and notes attached to linked declarations.
- [Annotations](annotations.md) covers planned and deprecated architecture, their rendering, and the legacy Graphviz override annotation.
- [Built-in Archinsight Types](built-in-types.md) explains the graph foundations, the system, container, and component hierarchy, deployment types, and built-in relationships.
- [Structuring an Insight Project](project-structure.md) covers source roles, context boundaries, imports, visibility, aliases, and object extensions.
- [Building and Linking an Insight Project](project-processing.md) follows sources through parsing, linking, diagnostics, introspection, graph selection, DOT generation, and image rendering.
- [Querying the Architecture Graph](graph-queries.md) describes the semantic graph, the Cypher-like query subset, scope variables, filtering, rollups, projections, and grouping.
- [C1: System Context](c1-system.md) explains context boundaries, system-level relationships, actors, and the built-in C1 entities and attributes.
- [C2: Containers and Services](c2-containers.md) describes container-level modeling, relationship rollup, deployment connections, and the built-in C2 attributes.
- [C3: Components](c3-components.md) covers component responsibilities, relationship ownership, rollup to C2 and C1, and the built-in C3 attributes.
- [C4: Code](c4-code.md) introduces the abstract code-element foundation and shows how project definitions create a code vocabulary and its containment rules.
- [Deployment](deployment.md) explains environments, deployment schemes, infrastructure placement, projections, profiles, and physical paths for logical elements and wires.
