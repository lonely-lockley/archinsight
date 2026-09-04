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

export type StoredDiagramQueryState = {
  diagramMode?: string;
  presetId?: string;
  presetVersion?: number;
  customizedQuery?: string;
  /** Legacy v1 state. New state uses presetId or customizedQuery. */
  query?: string;
  /** Legacy v1 state. New state uses presetId or customizedQuery. */
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
  if (state?.customizedQuery !== undefined) {
    return customQueryState(normalizeDiagramMode(state.diagramMode) ?? defaultDiagramMode, state.customizedQuery);
  }
  const identifiedPreset = resolveBuiltinView(state?.presetId);
  if (identifiedPreset !== undefined) {
    return presetQueryState(diagramModeForDefinition(identifiedPreset));
  }
  const storedMode = normalizeDiagramMode(state?.diagramMode);
  if (state?.queryPreset !== undefined) {
    return state.queryPreset
      ? presetQueryState(storedMode ?? defaultDiagramMode)
      : customQueryState(storedMode ?? defaultDiagramMode, state.query ?? queryForDiagramMode(storedMode ?? defaultDiagramMode));
  }
  const recognizedMode = state?.query === undefined ? undefined : legacyPresetModeForStoredQuery(state.query);
  const diagramMode = storedMode ?? recognizedMode ?? defaultDiagramMode;
  const queryPreset = state?.query === undefined || recognizedMode !== undefined;
  return {
    diagramMode,
    query: queryPreset ? queryForDiagramMode(diagramMode) : state?.query ?? queryForDiagramMode(diagramMode),
    queryPreset
  };
}

function legacyPresetModeForStoredQuery(value: string): DiagramMode | undefined {
  const current = diagramModeForQuery(value);
  if (current !== undefined) {
    return current;
  }
  const normalized = normalizeQuery(value);
  for (const definition of BUILTIN_VIEW_DEFINITIONS) {
    if (definition.legacyPresetQueries.some(({ query }) => normalizeQuery(query) === normalized)) {
      return diagramModeForDefinition(definition);
    }
  }
  return undefined;
}

function presetQueryState(diagramMode: DiagramMode): DiagramQueryPresetState {
  return { diagramMode, query: queryForDiagramMode(diagramMode), queryPreset: true };
}

function customQueryState(diagramMode: DiagramMode, query: string): DiagramQueryPresetState {
  return { diagramMode, query, queryPreset: false };
}

function diagramModeForDefinition(definition: BuiltinViewDefinition): DiagramMode {
  return definition.id === 'no-filter' ? 'default' : definition.id;
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
