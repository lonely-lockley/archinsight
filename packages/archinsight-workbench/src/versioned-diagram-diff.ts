import type {
  AttributedDiagramDiff,
  DiagramDiffRevision,
  DiagramDiffRevisionCatalogue,
} from '@archinsight/contracts';
import type { DiagramElementQuickActionMetadata, LinkProjectResult } from '@insight/language';

export type DiagramDiffPickerState =
  | { readonly status: 'closed' }
  | { readonly status: 'loading'; readonly source: string; readonly elementId: string }
  | {
      readonly status: 'ready';
      readonly source: string;
      readonly elementId: string;
      readonly catalogue: DiagramDiffRevisionCatalogue;
      readonly before?: string;
      readonly after: string;
      readonly validationError?: string;
    }
  | { readonly status: 'error'; readonly source: string; readonly elementId: string; readonly message: string };

export type DiagramDiffMode =
  | { readonly status: 'idle' }
  | {
      readonly status: 'showing-diff';
      readonly before: string;
      readonly after: string;
      readonly beforeShort: string;
      readonly afterShort: string;
      readonly currentRevision: string;
      readonly selectedElementId: string;
      readonly result?: AttributedDiagramDiff;
    };

export const closedDiagramDiffPicker: DiagramDiffPickerState = { status: 'closed' };
export const idleDiagramDiffMode: DiagramDiffMode = { status: 'idle' };

export function diagramDiffDeclarationNavigationAvailable(mode: DiagramDiffMode): boolean {
  return mode.status === 'idle'
    || mode.before === mode.currentRevision
    || mode.after === mode.currentRevision;
}

/** Resolves the versioned model file owned by the selected diagram element. */
export function diagramDiffDeclarationSource(
  metadata: Pick<DiagramElementQuickActionMetadata, 'declaration'>,
): string | undefined {
  const source = metadata.declaration?.sourceName;
  return source?.toLowerCase().endsWith('.ai') === true ? source : undefined;
}

/**
 * Resolves the same model source after a repository-only file move. Source
 * paths are provenance; stable tab roots and context ids carry model identity.
 */
export function correspondingRevisionSource(
  current: Pick<LinkProjectResult, 'tabRoots' | 'contexts'>,
  revision: Pick<LinkProjectResult, 'tabRoots' | 'contexts'>,
  currentSource: string,
): string | undefined {
  if (revision.tabRoots[currentSource] !== undefined
      || revision.contexts.some((context) => context.sourceIdentity === currentSource)) {
    return currentSource;
  }

  const currentRoots = new Set(current.tabRoots[currentSource] ?? []);
  if (currentRoots.size > 0) {
    const candidates = Object.entries(revision.tabRoots)
      .map(([source, roots]) => ({
        source,
        overlap: roots.filter((root) => currentRoots.has(root)).length,
        distance: new Set([...currentRoots, ...roots]).size,
      }))
      .filter((candidate) => candidate.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance || left.source.localeCompare(right.source));
    const best = candidates[0];
    const next = candidates[1];
    if (best !== undefined
        && (next === undefined || best.overlap !== next.overlap || best.distance !== next.distance)) {
      return best.source;
    }
  }

  const contextIds = current.contexts
    .filter((context) => context.sourceIdentity === currentSource)
    .map((context) => context.id);
  const contextSources = [...new Set(revision.contexts
    .filter((context) => contextIds.includes(context.id))
    .map((context) => context.sourceIdentity))];
  return contextSources.length === 1 ? contextSources[0] : undefined;
}

export function readyDiagramDiffPicker(
  catalogue: DiagramDiffRevisionCatalogue,
  elementId: string,
): DiagramDiffPickerState {
  const after = catalogue.currentRevision;
  const currentIndex = catalogue.revisions.findIndex((item) => item.id === after);
  const before = catalogue.revisions.slice(Math.max(0, currentIndex + 1)).find((item) => item.id !== after)?.id;
  return {
    status: 'ready',
    source: catalogue.source,
    elementId,
    catalogue,
    ...(before === undefined ? {} : { before }),
    after,
  };
}

export function selectDiagramDiffRevision(
  state: DiagramDiffPickerState,
  side: 'before' | 'after',
  revision: string,
): DiagramDiffPickerState {
  if (state.status !== 'ready' || !state.catalogue.revisions.some((item) => item.id === revision)) return state;
  return { ...state, [side]: revision, validationError: undefined };
}

/** Orders two selected revisions according to the catalogue's newest-first history. */
export function orderedDiagramDiffRevisionPair(
  state: Extract<DiagramDiffPickerState, { readonly status: 'ready' }>,
  first: string,
  second: string,
): { readonly before: string; readonly after: string } | undefined {
  const firstIndex = state.catalogue.revisions.findIndex((item) => item.id === first);
  const secondIndex = state.catalogue.revisions.findIndex((item) => item.id === second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) return undefined;
  return firstIndex > secondIndex
    ? { before: first, after: second }
    : { before: second, after: first };
}

/** Applies a click to a two-boundary revision interval without creating a third selection. */
export function updateDiagramDiffRevisionSelection(
  state: Extract<DiagramDiffPickerState, { readonly status: 'ready' }>,
  selection: readonly string[],
  revision: string,
): readonly string[] {
  const revisions = state.catalogue.revisions;
  const revisionIndex = revisions.findIndex((item) => item.id === revision);
  if (revisionIndex < 0) return selection;
  const validSelection = [...new Set(selection.filter((id) => revisions.some((item) => item.id === id)))];
  if (validSelection.includes(revision)) return validSelection.filter((id) => id !== revision);
  if (validSelection.length < 2) return [...validSelection, revision];

  const pair = orderedDiagramDiffRevisionPair(state, validSelection[0]!, validSelection[1]!);
  if (pair === undefined) return [revision];
  const afterIndex = revisions.findIndex((item) => item.id === pair.after);
  return revisionIndex < afterIndex
    ? [revision, pair.before]
    : [pair.after, revision];
}

export function diagramDiffCompareDisabledReason(state: DiagramDiffPickerState): string | undefined {
  if (state.status !== 'ready') return 'Revision history is still loading';
  if (state.before === undefined) return 'No earlier revision is available for this file';
  if (state.before === state.after) return 'Choose two different revisions';
  const beforeIndex = state.catalogue.revisions.findIndex((item) => item.id === state.before);
  const afterIndex = state.catalogue.revisions.findIndex((item) => item.id === state.after);
  if (beforeIndex < 0 || afterIndex < 0 || beforeIndex <= afterIndex) return 'Before must be older than After';
  return state.validationError;
}

export function diagramDiffRevision(
  state: Extract<DiagramDiffPickerState, { readonly status: 'ready' }>,
  id: string,
): DiagramDiffRevision | undefined {
  return state.catalogue.revisions.find((item) => item.id === id);
}
