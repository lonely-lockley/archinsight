import type {
  DiagramElementQuickActionMetadata,
  DiagramQuickActionMetadata
} from '@insight/language';

export type DiagramQuickActionId = 'isolate' | 'show-deployment' | 'go-to-declaration' | 'find-path';

export type DiagramQuickActionItem = {
  readonly id: DiagramQuickActionId;
  readonly label: string;
  readonly icon: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
};

export type FindPathMode =
  | { readonly status: 'idle' }
  | {
      readonly status: 'selecting-target';
      readonly sourceId: string;
      readonly sourceTitle: string;
    }
  | { readonly status: 'resolving-path'; readonly sourceId: string; readonly sourceTitle: string; readonly targetId: string; readonly targetTitle: string }
  | { readonly status: 'showing-path'; readonly sourceId: string; readonly sourceTitle: string; readonly targetId: string; readonly targetTitle: string };

export const idleFindPathMode: FindPathMode = { status: 'idle' };

export type IsolateMode =
  | { readonly status: 'idle' }
  | {
      readonly status: 'showing-isolate';
      readonly elementId: string;
      readonly elementTitle: string;
    };

export const idleIsolateMode: IsolateMode = { status: 'idle' };

export function beginIsolate(metadata: DiagramElementQuickActionMetadata): IsolateMode {
  return {
    status: 'showing-isolate',
    elementId: metadata.canonicalElementId,
    elementTitle: metadata.title
  };
}

export function cancelIsolate(_mode: IsolateMode): IsolateMode {
  return idleIsolateMode;
}

export function cancelFindPath(_mode: FindPathMode): FindPathMode {
  return idleFindPathMode;
}

export function beginFindPath(metadata: DiagramElementQuickActionMetadata): FindPathMode {
  return {
    status: 'selecting-target',
    sourceId: metadata.canonicalElementId,
    sourceTitle: metadata.title
  };
}

export function resolveFindPathTarget(
  mode: FindPathMode,
  metadata: DiagramElementQuickActionMetadata
): FindPathMode {
  if (mode.status !== 'selecting-target' || !metadata.pathEligible
      || metadata.canonicalElementId === mode.sourceId) return mode;
  return {
    status: 'resolving-path',
    sourceId: mode.sourceId,
    sourceTitle: mode.sourceTitle,
    targetId: metadata.canonicalElementId,
    targetTitle: metadata.title
  };
}

export function showResolvedFindPath(mode: FindPathMode): FindPathMode {
  return mode.status !== 'resolving-path' ? mode : { ...mode, status: 'showing-path' };
}

export function reverseFindPathResult(mode: FindPathMode): FindPathMode {
  if (mode.status !== 'showing-path') return mode;
  return {
    status: 'resolving-path',
    sourceId: mode.targetId,
    sourceTitle: mode.targetTitle,
    targetId: mode.sourceId,
    targetTitle: mode.sourceTitle
  };
}

export function retryFindPathTarget(mode: FindPathMode): FindPathMode {
  return mode.status === 'resolving-path' || mode.status === 'showing-path'
    ? { status: 'selecting-target', sourceId: mode.sourceId, sourceTitle: mode.sourceTitle }
    : mode;
}

export function quickActionItems(
  allMetadata: DiagramQuickActionMetadata,
  elementId: string
): readonly DiagramQuickActionItem[] {
  const occurrenceSeparator = elementId.indexOf('@@');
  const canonicalElementId = occurrenceSeparator < 0 ? elementId : elementId.slice(0, occurrenceSeparator);
  const metadata = allMetadata[elementId] ?? allMetadata[canonicalElementId];
  if (metadata === undefined) return [];
  return [
    item('isolate', 'Isolate', '◎', metadata.pathEligible, 'Isolation is unavailable for this element'),
    item('show-deployment', 'Show deployment', '▦', metadata.hasDeployment, 'No deployment'),
    item('go-to-declaration', 'Go to declaration', '⌘', metadata.declaration !== undefined, 'Declaration is unavailable'),
    item('find-path', 'Find path', '⌁', metadata.pathEligible, 'Path search is unavailable for this element')
  ];
}

function item(
  id: DiagramQuickActionId,
  label: string,
  icon: string,
  enabled: boolean,
  disabledReason: string
): DiagramQuickActionItem {
  return { id, label, icon, enabled, ...(enabled ? {} : { disabledReason }) };
}
