# Diagram Quick Actions

Diagram quick actions let you inspect a smaller part of the current diagram,
open its source, or compare revisions without changing the project model.

## Opening quick actions

Elements that support quick actions have a small button in their top-right
corner. The button opens a radial menu with the actions available for that
element:

- **Drill down**
- **Isolate**
- **Show deployment**
- **Go to declaration**
- **Find path**
- **Diff**

An action remains visible when it is unavailable, but cannot be selected. The
menu closes after an action, when you click outside it, or when you press
`Esc`. The menu can also be used from the keyboard.

Clicking the body of an element selects it. Clicking a relationship does
nothing. Use **Go to declaration** when you want to open an element's source.
Diagram boundaries can be selected, but do not have a quick-action menu.

## Temporary results

Drill down, Isolate, Show deployment, Find path, and Diff display temporary
results in the current diagram area. They do not change `.ai`, `.aiq`, or
repository files.

Temporary results can be opened one after another. **Back** returns to the
previous result. The close button leaves the temporary mode completely and
returns to the ordinary diagram. Temporary results are discarded when the
workspace is reloaded.

## Drill down

**Drill down** opens the next level inside an architecture element:

- a system opens its containers and services;
- a container or service opens its components;
- a component opens its code elements.

The result stays focused on the selected element while keeping enough outside
context to understand its connections. You can drill down again when another
level is available, or use **Back** to return.

## Isolate

**Isolate** shows the selected element together with the elements directly
connected to it. Other parts of the current diagram are hidden.

The selected element remains highlighted. Use **Back** to restore the previous
diagram.

## Show deployment

**Show deployment** opens the deployed representation of the selected element
and its immediate surroundings.

When only one environment is relevant, it opens automatically. When several
environments are available, Archinsight asks which one to show. Closing the
environment picker leaves the current diagram unchanged.

The chosen environment is shown in the temporary-result control. Selecting a
different environment updates the current deployment result without adding
another Back step.

## Go to declaration

**Go to declaration** opens the source file containing the selected element
and moves the cursor to its declaration. The action is unavailable when the
current host cannot open that source location.

## Find path

**Find path** first marks the selected element as the source. You can then move
between tabs and diagrams and click another element to choose the target.

The source is highlighted in orange and the target in purple. **Reverse** swaps
them and recalculates the result in the opposite direction. If no path is
found, the diagram keeps both endpoints visible and records the result in
Output.

Press `Esc` or close the temporary mode to cancel target selection.

## Diff

**Diff** compares two revisions of the project. It is available in workspaces
that provide version history, such as a Git-backed VS Code workspace. It can
remain disabled in a workspace without revision support.

Choose the Before and After revisions and start the comparison. The diagram
uses:

- green for additions;
- red for removals;
- yellow for changes.

You can continue using Drill down and Isolate while viewing a diff. Changing
the active tab, view, query, or deployment environment keeps the selected
revision pair and shows the same comparison in the new representation.

**Go to declaration** is available when the compared revision matches the
project currently open in the workspace. Archinsight does not switch the
working tree to open a historical declaration.

## Export

DOT, SVG, and PNG export use the result currently visible in the diagram area,
including temporary quick-action results and diffs.

## Command line

The same common actions are available from the CLI:

```shell
archinsight quick-action drill-down . --element <id>
archinsight quick-action isolate . --element <id>
archinsight quick-action deployment . --element <id> --environment <environment>
archinsight quick-action find-path . --from <source-id> --to <target-id>
archinsight quick-action declaration . --element <id>
```

Use canonical element IDs from `archinsight structure .` or query output.
Quick actions support `text`, `json`, `dot`, `svg`, and `png`; use
`--out <file>` to save an artifact.
