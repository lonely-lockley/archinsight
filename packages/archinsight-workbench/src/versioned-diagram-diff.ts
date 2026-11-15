import type {
  AttributedDiagramDiff,
  DiagramDiffRevision,
  DiagramDiffRevisionCatalogue,
} from '@archinsight/contracts';

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
      readonly selectedElementId: string;
      readonly result?: AttributedDiagramDiff;
    };

export const closedDiagramDiffPicker: DiagramDiffPickerState = { status: 'closed' };
export const idleDiagramDiffMode: DiagramDiffMode = { status: 'idle' };

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
