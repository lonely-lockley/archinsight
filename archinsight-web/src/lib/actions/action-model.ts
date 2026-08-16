import type { AppCapability } from '$lib/api';

export type WorkspaceSurface = 'editor' | 'playground';
export type ActionEffect = 'navigation' | 'workspace-local' | 'repository-read' | 'repository-write' | 'publication-write' | 'session';
export type DeniedPresentation = 'hidden' | 'disabled';

export type ActionDefinition = {
  effect: ActionEffect;
  capability?: AppCapability;
  whenDenied: DeniedPresentation;
};

export const actionCatalog = {
  'repository.project.create': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.project.manage': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.file.create': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.file.save': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.file.rename': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.file.delete': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.folder.create': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.folder.rename': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'repository.folder.delete': { effect: 'repository-write', capability: 'repository:write-own', whenDenied: 'disabled' },
  'publication.toggle': { effect: 'publication-write', capability: 'publication:manage', whenDenied: 'hidden' }
} as const satisfies Record<string, ActionDefinition>;

export type ActionId = keyof typeof actionCatalog;

export type ControlState = {
  hidden: boolean;
  disabled: boolean;
  reason?: string;
};

export type ActionContext = {
  surface: WorkspaceSurface;
  capabilities: readonly AppCapability[];
  available?: boolean;
  unavailableReason?: string;
};

export function controlState(actionId: ActionId, context: ActionContext): ControlState {
  const action = actionCatalog[actionId];
  const denied = authorizationDenied(action, context);
  if (denied) {
    return action.whenDenied === 'hidden'
      ? hiddenControl(denied)
      : disabledControl(denied);
  }
  if (context.available === false) {
    return disabledControl(context.unavailableReason ?? 'Action is unavailable');
  }
  return { hidden: false, disabled: false };
}

export function canExecute(state: ControlState): boolean {
  return !state.hidden && !state.disabled;
}

function authorizationDenied(action: ActionDefinition, context: ActionContext): string | undefined {
  if (context.surface === 'playground' && (action.effect === 'repository-write' || action.effect === 'publication-write')) {
    return action.effect === 'repository-write'
      ? 'Published project cannot be modified'
      : 'Publication management is unavailable in playground';
  }
  if (action.capability && !context.capabilities.includes(action.capability)) {
    return 'Action is not permitted';
  }
  return undefined;
}

function disabledControl(reason: string): ControlState {
  return { hidden: false, disabled: true, reason };
}

function hiddenControl(reason: string): ControlState {
  return { hidden: true, disabled: true, reason };
}
