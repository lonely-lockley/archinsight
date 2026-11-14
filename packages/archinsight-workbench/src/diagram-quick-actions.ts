import type {
  DiagramElementQuickActionMetadata,
  DiagramQuickActionMetadata
} from '@insight/language';

export type DiagramQuickActionId = 'isolate' | 'show-deployment' | 'go-to-declaration' | 'find-path';

export type DiagramQuickActionAnchor = {
  /** Coordinates relative to the quick-actions overlay. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

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
      readonly sourceEnvironment?: string;
    }
  | {
      readonly status: 'resolving-path';
      readonly sourceId: string;
      readonly sourceTitle: string;
      readonly sourceEnvironment?: string;
      readonly targetId: string;
      readonly targetTitle: string;
      readonly targetEnvironment?: string;
    }
  | {
      readonly status: 'showing-path';
      readonly sourceId: string;
      readonly sourceTitle: string;
      readonly sourceEnvironment?: string;
      readonly targetId: string;
      readonly targetTitle: string;
      readonly targetEnvironment?: string;
    };

export const idleFindPathMode: FindPathMode = { status: 'idle' };

export type IsolateMode =
  | { readonly status: 'idle' }
  | {
      readonly status: 'showing-isolate';
      readonly elementId: string;
      readonly elementTitle: string;
    };

export const idleIsolateMode: IsolateMode = { status: 'idle' };

export type DeploymentMode =
  | { readonly status: 'idle' }
  | {
      readonly status: 'showing-deployment';
      readonly elementId: string;
      readonly elementTitle: string;
      readonly environment: string;
      readonly focusElementIds: readonly string[];
    };

export const idleDeploymentMode: DeploymentMode = { status: 'idle' };

export function beginDeployment(
  metadata: DiagramElementQuickActionMetadata,
  environment: string,
  focusElementIds: readonly string[] = [metadata.canonicalElementId]
): DeploymentMode {
  return {
    status: 'showing-deployment',
    elementId: metadata.canonicalElementId,
    elementTitle: metadata.title,
    environment,
    focusElementIds: [...new Set(focusElementIds)].sort()
  };
}

export function cancelDeployment(_mode: DeploymentMode): DeploymentMode {
  return idleDeploymentMode;
}

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

export function beginFindPath(
  metadata: DiagramElementQuickActionMetadata,
  environment?: string
): FindPathMode {
  return {
    status: 'selecting-target',
    sourceId: metadata.canonicalElementId,
    sourceTitle: metadata.title,
    ...(environment === undefined ? {} : { sourceEnvironment: environment })
  };
}

export function resolveFindPathTarget(
  mode: FindPathMode,
  metadata: DiagramElementQuickActionMetadata,
  environment?: string
): FindPathMode {
  if (mode.status !== 'selecting-target' || !metadata.pathEligible
      || metadata.canonicalElementId === mode.sourceId) return mode;
  return {
    status: 'resolving-path',
    sourceId: mode.sourceId,
    sourceTitle: mode.sourceTitle,
    ...(mode.sourceEnvironment === undefined ? {} : { sourceEnvironment: mode.sourceEnvironment }),
    targetId: metadata.canonicalElementId,
    targetTitle: metadata.title,
    ...(environment === undefined ? {} : { targetEnvironment: environment })
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
    ...(mode.targetEnvironment === undefined ? {} : { sourceEnvironment: mode.targetEnvironment }),
    targetId: mode.sourceId,
    targetTitle: mode.sourceTitle,
    ...(mode.sourceEnvironment === undefined ? {} : { targetEnvironment: mode.sourceEnvironment })
  };
}

export function retryFindPathTarget(mode: FindPathMode): FindPathMode {
  return mode.status === 'resolving-path' || mode.status === 'showing-path'
    ? {
        status: 'selecting-target',
        sourceId: mode.sourceId,
        sourceTitle: mode.sourceTitle,
        ...(mode.sourceEnvironment === undefined ? {} : { sourceEnvironment: mode.sourceEnvironment })
      }
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
    item('isolate', 'Isolate', '◎', metadata.isolateEligible, 'Isolation is unavailable for this element'),
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
