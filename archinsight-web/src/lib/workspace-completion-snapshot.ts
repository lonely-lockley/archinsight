import type { ProjectStructure } from './api';
import type {
  CompletionDocumentation,
  ContextualIdentifier,
  VisibleIdentifier
} from '@insight/language';

type WorkspaceCompletionIdentifier = {
  label: string;
  type: string;
  imported?: boolean;
  documentation?: CompletionDocumentation;
};

export type WorkspaceCompletionSnapshot = {
  schemaVersion: 'workspace-completion-snapshot.v1';
  revision: number;
  contextIds: readonly string[];
  contextualIdentifiers: readonly ContextualIdentifier[];
  identifiersBySource: Readonly<Record<string, readonly WorkspaceCompletionIdentifier[]>>;
};

export const emptyWorkspaceCompletionSnapshot: WorkspaceCompletionSnapshot = {
  schemaVersion: 'workspace-completion-snapshot.v1',
  revision: 0,
  contextIds: [],
  contextualIdentifiers: [],
  identifiersBySource: {}
};

export function completionSnapshotFromProjectStructure(
  structure: ProjectStructure,
  revision: number
): WorkspaceCompletionSnapshot {
  return {
    schemaVersion: 'workspace-completion-snapshot.v1',
    revision,
    contextIds: uniqueSorted(structure.contexts.map((context) => context.id)),
    contextualIdentifiers: contextualIdentifiersFrom(structure),
    identifiersBySource: importedIdentifiersBySource(structure)
  };
}

export function visibleIdentifiersForSource(
  snapshot: WorkspaceCompletionSnapshot,
  sourceIdentity: string
): ReadonlyMap<string, VisibleIdentifier> {
  return new Map((snapshot.identifiersBySource[sourceIdentity] ?? []).map((identifier) => [
    identifier.label,
    identifier
  ]));
}

export function hasErrorDiagnostics(diagnostics: readonly { level: string }[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === 'ERROR');
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function contextualIdentifiersFrom(structure: ProjectStructure): ContextualIdentifier[] {
  const identifiers = new Map<string, ContextualIdentifier>();
  for (const context of structure.contexts) {
    for (const identifier of collectContextualIdentifiers(context.children, context.id)) {
      const key = JSON.stringify([
        identifier.contextId,
        identifier.label,
        identifier.type,
        identifier.documentation
      ]);
      if (!identifiers.has(key)) identifiers.set(key, identifier);
    }
  }
  return [...identifiers.values()];
}

function collectContextualIdentifiers(
  declarations: ProjectStructure['contexts'][number]['children'],
  contextId: string
): ContextualIdentifier[] {
  return declarations.flatMap((declaration) => [
    ...(declaration.kind === 'element' && declaration.type !== undefined
      ? [{
          label: declaration.id,
          type: declaration.type,
          contextId,
          ...(declaration.documentation === undefined ? {} : { documentation: declaration.documentation })
        }]
      : []),
    ...collectContextualIdentifiers(declaration.children, contextId)
  ]);
}

function importedIdentifiersBySource(
  structure: ProjectStructure
): Readonly<Record<string, readonly WorkspaceCompletionIdentifier[]>> {
  const result = new Map<string, Map<string, WorkspaceCompletionIdentifier>>();
  for (const context of structure.contexts) {
    collectImportedIdentifiers(context.children, result);
  }
  return Object.fromEntries([...result.entries()].map(([source, identifiers]) => [
    source,
    [...identifiers.values()].sort((left, right) => left.label.localeCompare(right.label))
  ]));
}

function collectImportedIdentifiers(
  declarations: ProjectStructure['contexts'][number]['children'],
  result: Map<string, Map<string, WorkspaceCompletionIdentifier>>
): void {
  for (const declaration of declarations) {
    if (declaration.kind === 'import' && declaration.type !== undefined) {
      const identifiers = result.get(declaration.source) ?? new Map<string, WorkspaceCompletionIdentifier>();
      identifiers.set(declaration.id, {
        label: declaration.id,
        type: declaration.type,
        imported: true,
        ...(declaration.documentation === undefined ? {} : { documentation: declaration.documentation })
      });
      result.set(declaration.source, identifiers);
    }
    collectImportedIdentifiers(declaration.children, result);
  }
}
