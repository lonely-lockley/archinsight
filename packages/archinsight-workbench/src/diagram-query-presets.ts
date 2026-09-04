import {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_QUERIES,
  builtinViewDefinition,
  resolveBuiltinView,
  type BuiltinViewDefinition
} from '@insight/language';
import type { DiagramMode } from './workspace-types';

export const defaultDiagramMode: DiagramMode = 'c1';
export const defaultQuery = BUILTIN_VIEW_QUERIES.c1;

const legacyPresetQueries: Partial<Record<DiagramMode, readonly string[]>> = {
  'deployment-system': deploymentLegacyQueries(BUILTIN_VIEW_QUERIES['deployment-system']),
  'deployment-container': deploymentLegacyQueries(BUILTIN_VIEW_QUERIES['deployment-container'])
};

export type StoredDiagramQueryState = {
  diagramMode?: string;
  query?: string;
  queryPreset?: boolean;
};

export type DiagramQueryPresetState = {
  diagramMode: DiagramMode;
  query: string;
  queryPreset: boolean;
};

export function queryForDiagramMode(mode: DiagramMode): string {
  return diagramModeDefinition(mode).query;
}

export function diagramModeDefinition(mode: DiagramMode): BuiltinViewDefinition {
  return mode === 'default' ? builtinViewDefinition('no-filter') : builtinViewDefinition(mode);
}

export function diagramModeForQuery(value: string): DiagramMode | undefined {
  const normalized = normalizeQuery(value);
  for (const definition of BUILTIN_VIEW_DEFINITIONS) {
    if (normalized === normalizeQuery(definition.query)) {
      return definition.id === 'no-filter' ? 'default' : definition.id;
    }
  }
  return undefined;
}

export function normalizeDiagramMode(value: string | undefined): DiagramMode | undefined {
  if (value === 'default') {
    return value;
  }
  return resolveBuiltinView(value)?.id;
}

export function resolveStoredDiagramQuery(state: StoredDiagramQueryState | undefined): DiagramQueryPresetState {
  const recognizedMode = state?.query === undefined ? undefined : presetModeForStoredQuery(state.query);
  const diagramMode = normalizeDiagramMode(state?.diagramMode) ?? recognizedMode ?? defaultDiagramMode;
  const queryPreset = state?.queryPreset ?? (state?.query === undefined || recognizedMode !== undefined);
  return {
    diagramMode,
    query: queryPreset ? queryForDiagramMode(diagramMode) : state?.query ?? queryForDiagramMode(diagramMode),
    queryPreset
  };
}

function presetModeForStoredQuery(value: string): DiagramMode | undefined {
  const current = diagramModeForQuery(value);
  if (current !== undefined) {
    return current;
  }
  const normalized = normalizeQuery(value);
  for (const [mode, queries] of Object.entries(legacyPresetQueries) as Array<[DiagramMode, readonly string[]]>) {
    if (queries.some((query) => normalizeQuery(query) === normalized)) {
      return mode;
    }
  }
  return undefined;
}

function withoutSystemSeed(query: string): string {
  return query.replace('\n    OR node IS SystemElement', '');
}

function deploymentLegacyQueries(query: string): readonly string[] {
  const previous = query.replace('\n   OR projectedPeer IS SystemElement', '');
  return [previous, withoutSystemSeed(previous)];
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
