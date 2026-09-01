import {
  buildLanguageSnapshotFromSources,
  coreLanguageSnapshot,
  coreSource,
  coreSources,
  mergeLanguageSnapshots,
  type LanguageSnapshot
} from '@insight/language';
import type { Diagnostic, ProjectStructure } from '$lib/api';
import {
  completionSnapshotFromProjectStructure,
  type WorkspaceCompletionSnapshot
} from '$lib/workspace-completion-snapshot';
import { isProjectSourceTab } from '$lib/workspace/editor/tab-persistence';
import type { WorkspaceTab } from '$lib/workspace-types';

const coreSourceIdentity = coreSources.some((source) => source.sourceName === 'core.ai')
  ? 'core.ai'
  : coreSources[0]?.sourceName ?? 'core.ai';
const coreSourceByName = new Map(coreSources.map((source) => [source.sourceName, source.source]));

export const workspaceCoreSources = {
  source: (sourceIdentity: string): string => coreSourceByName.get(sourceIdentity) ?? coreSource,
  exists: (sourceIdentity: string): boolean => coreSourceByName.has(sourceIdentity),
  identity: (): string => coreSourceIdentity,
  readonlyTabId: (sourceIdentity: string): string => `__readonly__/${sourceIdentity}`
};

export function editorSymbolsFor(state: {
  tabs: WorkspaceTab[];
  projectSymbols: LanguageSnapshot;
}): LanguageSnapshot {
  const openSymbols = buildLanguageSnapshotFromSources(state.tabs.filter(isProjectSourceTab).map((tab) => ({
    sourceName: tab.sourceIdentity,
    source: tab.content
  })));
  return mergeLanguageSnapshots([coreLanguageSnapshot, state.projectSymbols, openSymbols]);
}

export function createEditorSynchronization(ports: {
  tabs(): WorkspaceTab[];
  projectSymbols(): LanguageSnapshot;
  snapshotRevision(): number;
  writeEditorSymbols(symbols: LanguageSnapshot): void;
  writeProjectStructure(
    structure: ProjectStructure,
    snapshot: WorkspaceCompletionSnapshot,
    revision: number
  ): void;
  replaceDiagnostics(read: (sourceIdentity: string) => Diagnostic[]): void;
  diagnosticsFor(sourceIdentity: string): Diagnostic[];
  refreshMarkers(): void;
  refreshTokenVocabulary(options: { readonly repaint?: boolean }): void;
}) {
  const refreshEditorSymbols = (): void => {
    ports.writeEditorSymbols(editorSymbolsFor({
      tabs: ports.tabs(),
      projectSymbols: ports.projectSymbols()
    }));
  };
  return {
    refreshDiagnostics() {
      ports.replaceDiagnostics(ports.diagnosticsFor);
      ports.refreshMarkers();
    },
    refreshEditorSymbols,
    acceptProjectStructure(structure: ProjectStructure) {
      const revision = ports.snapshotRevision() + 1;
      ports.writeProjectStructure(
        structure,
        completionSnapshotFromProjectStructure(structure, revision),
        revision
      );
    },
    refreshEditorTokenVocabulary(options: { readonly repaint?: boolean } = {}) {
      refreshEditorSymbols();
      ports.refreshTokenVocabulary(options);
    }
  };
}
