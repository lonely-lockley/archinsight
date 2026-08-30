# Annotations

Annotations attach lifecycle or rendering metadata to an architecture declaration. They are written immediately above an element or relationship and remain associated with it after the project is linked:

```insight
@planned
service recommendations
    name = Recommendation service
```

Several annotations may precede the same declaration. An annotation may also carry a text parameter in parentheses:

```insight
@deprecated(remove after storefront migration)
service legacy_catalog
    name = Legacy catalog
```

Annotations apply to element declarations and operator-created relationships. They do not annotate individual attribute assignments.

## `@planned`

`@planned` marks architecture that is intended but not yet part of the current operating system:

```insight
system commerce
    @planned
    service recommendations
        name = Recommendation service

    service storefront
        links:
            @planned(enable after recommendations launch)
            -> recommendations
```

The marker remains available in the linked model for tools that inspect annotations. The built-in Graphviz renderer highlights a planned element or relationship in green, allowing the future part of a diagram to remain visible without looking identical to the current architecture.

The optional parameter records a short explanation or condition. It does not change the built-in visual style.

## `@deprecated`

`@deprecated` marks an element or relationship that remains in the model while it is being retired:

```insight
@deprecated(remove after client migration)
system legacy_api
    name = Legacy API
```

The built-in Graphviz renderer highlights deprecated declarations in red. The optional parameter can record the replacement, migration condition, or expected removal point.

When both lifecycle annotations are attached to one declaration, `@planned` has visual priority in the current renderer. A declaration should normally have one lifecycle state so its meaning remains clear to readers.

Annotations on a logical wire are carried into physical relationships created from that wire by deployment projection. A planned logical integration therefore remains visibly planned when a Deployment view expands it through infrastructure.

## Inspecting annotations

Query JSON includes annotations on selected elements and relationships. The query language does not currently provide an annotation predicate, so a report starts with a broad graph and filters its JSON output:

```shell
archinsight query . -c <context-id> -v no-filter --format json |
jq '{
  elements: [
    .elements[] |
    select((.annotations // []) | length > 0) |
    {id, annotations}
  ],
  edges: [
    .edges[] |
    select((.edge.annotations // []) | length > 0) |
    {source, target, annotations: .edge.annotations}
  ]
}'
```

Each annotation retains its name, optional value, and source position. Element annotations are stored on the selected element. Relationship annotations are stored on the nested `edge` object because the outer edge record describes how that relationship was selected and rendered.

## Legacy `@attribute`

`@attribute` accepts comma-separated Graphviz property assignments and applies them directly to one rendered element or relationship:

```insight
@attribute(style=dotted,arrowhead=diamond)
-> catalog
```

This annotation exists for backward compatibility. It is deprecated and may be removed in a future version of the Insight language. New models should express visual conventions with a typed [presentation](language.md#presentations):

```insight
define operator PartnerIntegration of Wire
    constructor partnerLink Element
        on Element

define presentation PartnerIntegration
    graphviz
        style = dotted
```

A presentation belongs to the model vocabulary, follows type inheritance, and gives every instance of a concept the same visual meaning. It can also be reviewed and extended in a definitions file instead of distributing raw Graphviz settings across architecture declarations. Presentation properties form a supported set documented with the language; a raw legacy property has no direct replacement when it falls outside that set.

Legacy `@attribute` values are applied after the built-in lifecycle colors. A direct property can therefore override part of the `@planned` or `@deprecated` rendering. This ordering is maintained for compatibility and should not be used as a new styling mechanism.
