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

AIQ exposes element and relationship annotations through `annotations(value)`.
Use `UNWIND` to return one row per annotation:

```cypher
MATCH (element:Element)
WHERE element.context = $context
UNWIND annotations(element) AS annotation
RETURN TABLE elementId(element) AS element,
             annotation.name AS annotation,
             annotation.value AS value
ORDER BY element, annotation
```

The same function can be used in a predicate. For example,
`any(annotation IN annotations(element) WHERE annotation.name = 'planned')`
selects planned elements. Relationship aliases work in the same way.

Graph query JSON also includes annotations on selected elements and
relationships. A complete graph can be filtered with another JSON tool when a
graph-shaped result is required:

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

## `@icon`

Archinsight can show one technology icon on a rendered architecture element.
Without an annotation, it uses the first recognized value in the element's
`technology` attribute:

```insight
service catalog
    name = Catalog API
    technology = Quarkus, Java
```

An unknown technology is valid and simply renders without an icon.

Use `@icon(<catalog-id>)` when the desired icon differs from the technology
text:

```insight
@icon(postgresql)
container catalog_database
    name = Catalog database
    technology = Managed relational database
```

Use `@icon(none)` to hide the automatically selected icon for one element:

```insight
@icon(none)
system payments
    name = Payments
    technology = Java
```

Only elements support `@icon`. An unknown icon ID, more than one `@icon`
annotation on the same element, or an icon annotation on a relationship is an
error.

### Selecting an icon

In the web editor or VS Code workbench, place the cursor on an element or an
existing `@icon(...)` line and run **Select Technology Icon** from the editor
actions. The picker shows matching icons and applies the selection as one
undoable edit. VS Code also exposes the command through the Command Palette.

Completion is available while typing inside `@icon(...)`.

### Diagram output

The selected icon appears to the left of the element name. Automatic and
explicit icons are included consistently in web and VS Code diagrams and in
CLI SVG and PNG output. The icon follows the element colors of the active
diagram theme; no additional render option is required.
