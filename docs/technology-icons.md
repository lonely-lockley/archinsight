# Technology icons

ArchInsight can show one technology icon on any rendered architecture element. Icons appear in a dedicated column to the left of the element name and are preserved in web, VS Code, CLI, SVG, and PNG output.

## Automatic resolution

The normal source of an icon is the existing semantic `technology` attribute:

```insight
service catalog
    name = Catalog API
    technology = Quarkus, Java
```

ArchInsight checks the values in source order and uses the first unambiguous Devicon ID or explicit alias. Matching is case-insensitive, respects word boundaries, and is deterministic. Approximate matching is available in editor search, but is never used during rendering. An unknown technology is valid and simply has no icon.

## Explicit selection

Use `@icon` when the technology name and desired logo differ:

```insight
@icon(postgresql)
container catalogDatabase
    name = Catalog database
    technology = Managed relational database
```

`@icon(none)` disables automatic resolution for one element. An unknown explicit ID is an error and includes nearby ID suggestions. Repeating `@icon` or applying it to a relationship is also an error. The annotation is ordinary model metadata, so changes to it retain source provenance and appear in semantic diagram diffs.

## Selecting an icon in an editor

In the web editor or VS Code workbench, place the cursor on an element or an existing `@icon(...)` line and run **Select Technology Icon** from the editor actions. The picker filters a bounded catalog, shows previews lazily, and applies one undoable edit. Native VS Code exposes the same command through the Command Palette.

Text completion inside `@icon(...)` remains available as a keyboard-first fallback. It searches IDs, alternate names, curated aliases, and Devicon tags. The selected completion item resolves its preview lazily.

## Rendering and export

Icons are bundled with ArchInsight; rendering never downloads them from a CDN or reads project-local image files. The renderer inserts the selected normalized SVG into the Graphviz layout before rasterization, so the same self-contained SVG is used for PNG export. The icon color follows the resolved element text color in the selected diagram theme.

No CLI option is required. Existing `render`, quick-action, and diagram-diff commands resolve icons from the model and include them in SVG and PNG output automatically.

## Catalog and licensing

The initial catalog is generated from pinned Devicon `2.18.0` assets. ArchInsight validates and converts only SVG variants that can be represented safely as theme-aware monochrome icons. Excluded assets and alias conflicts are recorded in the generated machine-readable audit report.

Devicon is distributed under the MIT License. Product names, logos, and brands remain subject to their respective owners' policies. The pinned source metadata and upstream license are included with the generated catalog.

Existing models need no migration. They receive an icon only when a `technology` value has an unambiguous stable match; use `@icon(none)` or an explicit ID to control the result.
