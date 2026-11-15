# Diagram Quick Actions

Diagram quick actions provide contextual analysis and navigation without
changing the project model or creating saved queries. They operate on the
linked semantic graph behind the SVG, not on node labels or Graphviz geometry.

## Opening the menu

Supported element nodes show a small quick-action trigger near their top-right
corner. Ownership boundaries and Graphviz clusters do not have triggers. The
trigger opens a compact radial menu containing:

- **Isolate**;
- **Show deployment**;
- **Go to declaration**;
- **Find path**;
- **Diff**.

An unavailable action remains visible and explains why it is disabled. The
menu closes after an action, on an outside click, or with `Esc`. Its trigger and
items are keyboard accessible. The trigger uses the tooltip rendered by the
workbench; it deliberately has no native `title` tooltip.

A plain click on a diagram element changes the ordinary selection only. It no
longer opens the source file. Use **Go to declaration** for source navigation.

Quick-action controls are attached to the current SVG after every render and
are repositioned after SVG replacement or resize. Closing every tab removes the
SVG host safely; opening a new tab reconnects the controls.

## Temporary result modes

Isolate, Find path, Diff, and web Show deployment use temporary results. Their mode
control is appended to the end of the common toolbar and is hidden while no
mode is active. `Esc` and the Back control restore the diagram captured before
the first result in that mode.

The result mode belongs to the tab where it started. Pressing C1-C4 or D1-D2 in
that owner tab exits the mode before opening the selected view. The same view
buttons in another tab do not reset it. Repeating an action while viewing its
result does not replace the original Back snapshot.

These results are transient. They do not modify `.ai`, `.aiq`, or repository
files and are not restored after a workspace reload.

## Diff

Diff is enabled by a versioning capability of the workspace repository, not by
the tracked/dirty state of an individual file. The current VS Code adapter
provides it for Git worktrees. The DB-backed web repository does not provide
immutable revisions, so the same visible action remains disabled there.

The selected element is only the entry point and retained focus. The picker
uses the active `.ai` tab as its source, lists commits that changed that path
plus `HEAD`, and requires explicit Before and After revisions. An untracked file
therefore still has the action but normally has no historical pair and keeps
Compare disabled.

Both complete projects are read from repository objects without checkout. The
active view or fixed custom query is evaluated against both snapshots, and the
union diagram marks additions green, removals red, and semantic changes yellow.
Changes in another file are included when they change the selected view.

Every changed entry retains a stable change id, semantic source origins, and
local Git blame commits/authors. Exact ranges are preferred; declaration-level
fallback is recorded as an attribution diagnostic. This metadata is kept with
the temporary result even though the first UI does not yet display it.

The diagram remains interactive. Isolate filters the union rather than the
After graph and preserves statuses and attribution; Back returns to the full
diff, then to the ordinary diagram. DOT, SVG, and PNG export operate on the
currently visible diff. Declaration navigation asks which compared revision to
open when both contain the source.

## Isolate

Isolate is available for logical elements. It keeps the active logical scale
and renders:

- the selected focus element;
- every directly incoming neighbor and edge;
- every directly outgoing neighbor and edge;
- no second-hop elements or edges between neighbors.

Architectural boundaries are omitted. Incoming and outgoing neighbors are
placed on opposite sides of the focus. A bidirectional neighbor is duplicated
as two presentation occurrences, one in each direction, while retaining one
canonical semantic identity.

The focus uses the ordinary green selection outline. The toolbar displays
`Isolated: <element>` and Back.

## Show deployment

Show deployment is available when the selected logical element, or content in
its logical scope, has a materialized deployment occurrence. The action uses
the D2 deployment projection for one environment and renders:

- the deployment occurrences representing the selected logical scope;
- only physical or projected edges directly incident to those focus
  occurrences;
- the opposite endpoint of each retained edge;
- the ownership groups required to contain the retained elements.

This is a first-level deployment neighborhood. It does not recursively expand
external endpoints or include edges only between external neighbors.

Deployment ownership boundaries remain visible because they express
`runsOn`/placement containment. They are presentation groups, not graph edges.
Infrastructure endpoints and boundaries are not part of the focus.

A C1 or C2 boundary may not materialize as a node in D2. In that case the focus
is its displayed deployed descendants. For example, showing deployment for a
system can highlight its deployed frontend, backend, and renderer services.
Every focus occurrence receives the ordinary green selection outline.

If one environment is relevant, it is selected automatically. With several
environments:

- web uses a non-modal `DeploymentEnvironmentPicker` anchored to the action
  button inside the diagram overlay;
- VS Code uses its native Quick Pick.

In web, the toolbar displays
`Deployment: <element> · <environment>` and Back. Reopening Show deployment
from an active deployment result leaves that result visible under the picker.
Closing the picker changes nothing. Selecting an environment replaces the
temporary result, while Back still returns to the diagram shown before the
first Show deployment.

VS Code currently publishes Show deployment as an ad-hoc diagram result rather
than entering the web-specific Deployment toolbar mode.

## Go to declaration

Go to declaration is enabled when the linked element has source, line, and
column metadata. The host opens or activates the source and reveals that exact
position. Project Structure navigation remains independent and continues to
use its existing declaration metadata.

## Find path

Find path starts a non-modal target-selection mode instead of immediately
running a query. The source is highlighted in orange wherever its canonical
identity appears. The user can switch tabs, open another diagram, or use the
existing Project Structure search before clicking a compatible target.

Clicking a quick-action trigger opens its menu and does not select the target.
Clicking a compatible element body selects it. The toolbar remains visible
even on a diagram that does not contain the source, so the mode always has an
explicit exit.

### Directed result

The result is a directed path corridor: the union of all nodes and edges that
lie on at least one route from source to target. It preserves alternative
routes and removes dead-end side branches. An edge `A -> B` can be traversed
from A to B only. Therefore `A -> B` and `B -> A` are different requests: a
route found in one direction is not returned for the other direction.

Placement and ownership boundaries are containment, not relationships, and do
not participate in traversal. Authored edges between C and D elements remain
valid graph edges. The active C/D view is used first so the result retains its
scale rather than collapsing to C1 for a shorter derived route.

The source is orange and the target has a distinct purple outline. The ordinary
green selection outline is suppressed in a Find path result. The Reverse
button swaps source and target and recomputes the directed corridor without
replacing the saved Back snapshot.

If no directed route exists, the request is still a successful result. The
diagram shows source and target without a connecting edge, and Output records
`No path found between <source> and <target>.` No additional failure prompt is
shown.

### Deployment environments

An endpoint selected from a single-environment deployment view carries that
environment into the request. The path is evaluated only in that environment,
so identical physical routes from other environments are not duplicated. If
source and target were selected from different environments, no path is
returned.

Deployment occurrence ids normalize to canonical logical element ids when the
selection moves between C and D views. The visible occurrence in the active
view is used for rendering the result.

## Implementation boundaries

The language package owns semantic availability metadata and the pure graph
derivations:

- `selectIsolatedElementGraph`;
- `selectDeploymentGraph`;
- `selectPathGraph`.
- `diffRenderGraphs` and `selectIsolatedDiagramDiff`.

The workbench package owns the radial menu, mode state, toolbar controls, SVG
highlighting, and accessible interaction. Host controllers own snapshots,
tab ownership, environment selection, rendering, stale-result protection, and
source navigation. A common `VersionedRepository` port owns revision catalogue,
immutable snapshot, pair validation, and attribution operations; Git is one
Node adapter rather than a workbench dependency.

The implemented contracts are covered by language graph tests, workbench
component tests, web controller tests, VS Code tests, and the repository-wide
`./gradlew clean check` task.

## CLI and agent automation

The CLI exposes the same selectors as deterministic commands so agents and CI
jobs do not need to construct one-off AIQ filters:

| Action | Command | Result |
| --- | --- | --- |
| Isolate | `archinsight quick-action isolate . --element <id>` | The selected element and its directed first-level neighborhood. |
| Show deployment | `archinsight quick-action deployment . --element <id> --environment <environment>` | The selected logical scope as deployed in one environment, with its first-level physical neighborhood and ownership groups. |
| Find path | `archinsight quick-action find-path . --from <source-id> --to <target-id>` | The union of all directed routes from source to target, or the two endpoints when no route exists. |
| Go to declaration | `archinsight quick-action declaration . --element <id>` | Declaration metadata; graphical formats contain a one-element subdiagram. |

Element arguments use canonical linked ids, not display names. Obtain them from
`archinsight structure . --format text|json` or from a query result. Deployment
occurrence suffixes are normalized to their canonical logical id.

JSON is the default and uses schema `diagram-quick-action.v1`. Isolate and Find
path optionally accept a built-in `--view` with its `--source` or `--context`
scope. Deployment chooses the only relevant environment automatically and
requires `--environment` when the choice is ambiguous. Find path preserves the
ordered, directed source and target; an empty corridor is a successful result
with `pathFound: false` and both endpoints retained.

To search in the opposite direction, swap the arguments explicitly:

```shell
archinsight quick-action find-path . \
  --from <target-id> --to <source-id> \
  --format json
```

The command never performs an implicit undirected search and never combines
both directions into one result.

Every quick action supports `text`, `json`, `dot`, `svg`, and `png`. For
example:

```shell
archinsight quick-action find-path . \
  --from archinsight/user --to external_systems/google \
  --format png --out path.png
```

PNG is rasterized from the same Graphviz result as SVG and enforces limits on
dimensions, total pixels, and encoded output size. All four actions accept the
same output formats. For graphical formats, Go to declaration produces a
one-element subdiagram; JSON also includes its authored source coordinates.
The ordinary CLI `render` command uses the same
`text|json|dot|svg|png` diagram format set, including when it renders a custom
graph-returning `.aiq` query.

Use `--out <file>` for saved artifacts. Without it, textual formats and binary
PNG bytes are written to stdout. An unsupported element, ambiguous deployment
environment, invalid scope, or linker error produces a non-zero exit status.
