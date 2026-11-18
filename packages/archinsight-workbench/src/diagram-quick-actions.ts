import {
  canonicalDiagramElementId,
  type DiagramElementQuickActionMetadata,
  type DiagramQuickActionMetadata,
  type QueryScope
} from '@insight/language';
import { diagramDiffDeclarationSource } from './versioned-diagram-diff.js';

export type DiagramQuickActionId = 'drill-down' | 'isolate' | 'show-deployment' | 'go-to-declaration' | 'find-path' | 'diff';

export type DiagramQuickActionCapabilities = {
  readonly versioning: boolean;
  readonly declarationNavigation?: boolean;
};

export type DiagramQuickActionAnchor = {
  /** Coordinates relative to the quick-actions overlay. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type DiagramQuickActionViewport = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type DiagramQuickActionOffset = { readonly x: number; readonly y: number };

export function quickActionRadialOffsets(
  count: number,
  anchor: { readonly x: number; readonly y: number },
  viewport: DiagramQuickActionViewport,
  radius = 52
): readonly DiagramQuickActionOffset[] {
  if (count <= 0) return [];
  const itemInset = 20;
  const edgeExtent = radius + itemInset;
  const nearLeft = anchor.x - viewport.left < edgeExtent;
  const nearRight = viewport.right - anchor.x < edgeExtent;
  const nearTop = anchor.y - viewport.top < edgeExtent;
  const nearBottom = viewport.bottom - anchor.y < edgeExtent;
  const horizontalEdge = nearLeft || nearRight;
  const verticalEdge = nearTop || nearBottom;
  if (!horizontalEdge && !verticalEdge) {
    return Array.from({ length: count }, (_, index) => radialOffset(index * Math.PI * 2 / count, radius));
  }

  let start: number;
  let end: number;
  if (nearLeft && nearTop) [start, end] = [Math.PI / 2, Math.PI];
  else if (nearRight && nearTop) [start, end] = [-Math.PI / 2, -Math.PI];
  else if (nearLeft && nearBottom) [start, end] = [Math.PI / 2, 0];
  else if (nearRight && nearBottom) [start, end] = [-Math.PI / 2, 0];
  else if (nearLeft) [start, end] = [0, Math.PI];
  else if (nearRight) [start, end] = [0, -Math.PI];
  else if (nearTop) [start, end] = [Math.PI / 2, Math.PI * 3 / 2];
  else [start, end] = [-Math.PI / 2, Math.PI / 2];

  const corner = horizontalEdge && verticalEdge;
  const fanRadius = corner ? 92 : radius;
  const shiftX = nearLeft ? itemInset : nearRight ? -itemInset : 0;
  const shiftY = nearTop ? itemInset : nearBottom ? -itemInset : 0;
  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? 0.5 : index / (count - 1);
    const offset = radialOffset(start + (end - start) * fraction, fanRadius);
    return { x: offset.x + shiftX, y: offset.y + shiftY };
  });
}

function radialOffset(angle: number, radius: number): DiagramQuickActionOffset {
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

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
      readonly scope: QueryScope;
    }
  | {
      readonly status: 'resolving-path';
      readonly sourceId: string;
      readonly sourceTitle: string;
      readonly sourceEnvironment?: string;
      readonly targetId: string;
      readonly targetTitle: string;
      readonly targetEnvironment?: string;
      readonly scope: QueryScope;
    }
  | {
      readonly status: 'showing-path';
      readonly sourceId: string;
      readonly sourceTitle: string;
      readonly sourceEnvironment?: string;
      readonly targetId: string;
      readonly targetTitle: string;
      readonly targetEnvironment?: string;
      readonly scope: QueryScope;
    };

export const idleFindPathMode: FindPathMode = { status: 'idle' };

export type TransientDiagramResultKind = 'isolate' | 'find-path' | 'deployment' | 'diff';

export type TransientDiagramResultState =
  | { readonly status: 'idle' }
  | { readonly status: 'visible'; readonly kind: TransientDiagramResultKind };

export const idleTransientDiagramResult: TransientDiagramResultState = { status: 'idle' };

export function showTransientDiagramResult(kind: TransientDiagramResultKind): TransientDiagramResultState {
  return { status: 'visible', kind };
}

export function clearTransientDiagramResult(): TransientDiagramResultState {
  return idleTransientDiagramResult;
}

export type IsolateMode =
  | { readonly status: 'idle' }
  | {
      readonly status: 'showing-isolate';
      readonly elementId: string;
      readonly elementTitle: string;
    }
  | {
      readonly status: 'showing-drill-down';
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

export type DiagramQuickActionResultMode =
  | Extract<FindPathMode, { readonly status: 'showing-path' }>
  | Exclude<IsolateMode, { readonly status: 'idle' }>
  | Extract<DeploymentMode, { readonly status: 'showing-deployment' }>;

export function diagramQuickActionResultKind(
  mode: DiagramQuickActionResultMode
): Exclude<TransientDiagramResultKind, 'diff'> {
  if (mode.status === 'showing-path') return 'find-path';
  if (mode.status === 'showing-deployment') return 'deployment';
  return 'isolate';
}

export function beginDeployment(
  metadata: DiagramElementQuickActionMetadata,
  environment: string,
  focusElementIds: readonly string[] = [metadata.canonicalElementId]
): Extract<DeploymentMode, { readonly status: 'showing-deployment' }> {
  return {
    status: 'showing-deployment',
    elementId: metadata.canonicalElementId,
    elementTitle: metadata.title,
    environment,
    focusElementIds: [...new Set(focusElementIds)].sort()
  };
}

export function beginIsolate(
  metadata: DiagramElementQuickActionMetadata
): Extract<IsolateMode, { readonly status: 'showing-isolate' }> {
  return {
    status: 'showing-isolate',
    elementId: metadata.canonicalElementId,
    elementTitle: metadata.title
  };
}

export function beginDrillDown(
  metadata: DiagramElementQuickActionMetadata
): Extract<IsolateMode, { readonly status: 'showing-drill-down' }> {
  return {
    status: 'showing-drill-down',
    elementId: metadata.canonicalElementId,
    elementTitle: metadata.title
  };
}

export function cancelFindPath(_mode: FindPathMode): FindPathMode {
  return idleFindPathMode;
}

export function beginFindPath(
  metadata: DiagramElementQuickActionMetadata,
  scope: QueryScope,
  environment?: string
): Extract<FindPathMode, { readonly status: 'selecting-target' }> {
  return {
    status: 'selecting-target',
    sourceId: metadata.canonicalElementId,
    sourceTitle: metadata.title,
    ...(environment === undefined ? {} : { sourceEnvironment: environment }),
    scope
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
    scope: mode.scope,
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
    ...(mode.sourceEnvironment === undefined ? {} : { targetEnvironment: mode.sourceEnvironment }),
    scope: mode.scope
  };
}

export function retryFindPathTarget(mode: FindPathMode): FindPathMode {
  return mode.status === 'resolving-path' || mode.status === 'showing-path'
    ? {
        status: 'selecting-target',
        sourceId: mode.sourceId,
        sourceTitle: mode.sourceTitle,
        ...(mode.sourceEnvironment === undefined ? {} : { sourceEnvironment: mode.sourceEnvironment }),
        scope: mode.scope
      }
    : mode;
}

export function quickActionItems(
  allMetadata: DiagramQuickActionMetadata,
  elementId: string,
  capabilities: DiagramQuickActionCapabilities = { versioning: false }
): readonly DiagramQuickActionItem[] {
  const canonicalElementId = canonicalDiagramElementId(elementId);
  const metadata = allMetadata[elementId] ?? allMetadata[canonicalElementId];
  if (metadata === undefined) return [];
  return [
    item('drill-down', 'Drill down', '↧', metadata.hasChildren),
    item('isolate', 'Isolate', '◎', metadata.isolateEligible, 'Isolation is unavailable for this element'),
    item('show-deployment', 'Show deployment', '▦', metadata.hasDeployment, 'No deployment'),
    item(
      'go-to-declaration',
      'Go to declaration',
      '⌘',
      metadata.declaration !== undefined && capabilities.declarationNavigation !== false,
      capabilities.declarationNavigation === false
        ? 'Current Git revision is not part of this diff'
        : 'Declaration is unavailable'
    ),
    item('find-path', 'Find path', '⌁', metadata.pathEligible, 'Path search is unavailable for this element'),
    item('diff', 'Diff', '±', capabilities.versioning && diagramDiffDeclarationSource(metadata) !== undefined)
  ];
}

function item(
  id: DiagramQuickActionId,
  label: string,
  icon: string,
  enabled: boolean,
  disabledReason?: string
): DiagramQuickActionItem {
  return {
    id,
    label,
    icon,
    enabled,
    ...(enabled || disabledReason === undefined ? {} : { disabledReason })
  };
}
