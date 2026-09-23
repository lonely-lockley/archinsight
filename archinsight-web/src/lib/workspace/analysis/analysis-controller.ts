import type { LinkProjectResult } from '@insight/language';
import type { Diagnostic } from '$lib/api';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import {
  diagnosticsBySource,
  mergeDiagnostics,
  omitDiagnostics,
  uniqueDiagnostics,
  type DiagnosticsBySource
} from './diagnostics';

export type AnalysisSource = {
  readonly sourceIdentity: string;
  readonly content: string;
};

export type AnalysisDiagnosticsState = {
  readonly local: DiagnosticsBySource;
  readonly linker: DiagnosticsBySource;
};

export type AnalysisControllerPorts = {
  schedule(task: () => void, delay: number): number;
  cancel(handle: number): void;
  currentProjectId(): string;
  activeTabId(): string | undefined;
  linkedAnalysis(): LinkProjectResult | undefined;
  clearLinkedAnalysis(): void;
  invalidateRenderedQueries(): void;
  closeDeploymentPicker(): void;
  runLink(sequence: number, options?: LinkRunOptions): void | Promise<void>;
  runCachedDiagram(
    sequence: number,
    projectId: string,
    analysis: LinkProjectResult,
    expectedTabId: string | undefined
  ): void | Promise<void>;
  checkSyntax(sources: AnalysisSource[]): Promise<Diagnostic[]>;
  defaultSyntaxSources(): AnalysisSource[];
  readDiagnostics(): AnalysisDiagnosticsState;
  writeDiagnostics(state: AnalysisDiagnosticsState): void;
};

export type AnalysisController = {
  scheduleLink(delay?: number, options?: LinkRunOptions): void;
  scheduleDiagramUpdate(delay?: number): void;
  scheduleLiveSyntaxCheck(sources?: AnalysisSource[]): void;
  isCurrentLink(sequence: number, projectId?: string): boolean;
  updateLinkerDiagnostics(diagnostics: Diagnostic[], preflightSources?: string[]): void;
  updateLocalDiagnostics(checkedSources: string[], diagnostics: Diagnostic[]): void;
  removeDiagnostics(sources: string[]): void;
  diagnosticsFor(tab: Pick<WorkspaceTab, 'sourceIdentity'>): Diagnostic[];
  cancelCurrent(): void;
  reset(): void;
  dispose(): void;
};

export type LinkRunOptions = {
  readonly forceFullAnalysis?: boolean;
  readonly querySource?: string;
  readonly queryContext?: string;
};

export function createAnalysisController(ports: AnalysisControllerPorts): AnalysisController {
  let scheduledHandle: number | undefined;
  let linkSequence = 0;
  let liveSyntaxSequence = 0;

  const cancelScheduled = (): void => {
    if (scheduledHandle === undefined) {
      return;
    }
    ports.cancel(scheduledHandle);
    scheduledHandle = undefined;
  };

  const schedule = (task: () => void, delay: number): void => {
    cancelScheduled();
    scheduledHandle = ports.schedule(() => {
      scheduledHandle = undefined;
      task();
    }, delay);
  };

  const updateLocalDiagnostics = (checkedSources: string[], diagnostics: Diagnostic[]): void => {
    const state = ports.readDiagnostics();
    ports.writeDiagnostics({
      ...state,
      local: mergeDiagnostics(state.local, checkedSources, diagnostics)
    });
  };

  const reset = (): void => {
    linkSequence += 1;
    liveSyntaxSequence += 1;
    cancelScheduled();
    ports.clearLinkedAnalysis();
    ports.closeDeploymentPicker();
    ports.writeDiagnostics({ local: {}, linker: {} });
  };

  const scheduleLink = (delay = 500, options?: LinkRunOptions): void => {
    ports.closeDeploymentPicker();
    ports.clearLinkedAnalysis();
    ports.invalidateRenderedQueries();
    const sequence = ++linkSequence;
    schedule(() => void (options === undefined
      ? ports.runLink(sequence)
      : ports.runLink(sequence, options)), delay);
  };

  return {
    scheduleLink,

    scheduleDiagramUpdate(delay = 0) {
      const analysis = ports.linkedAnalysis();
      if (analysis === undefined) {
        scheduleLink();
        return;
      }
      const sequence = ++linkSequence;
      const projectId = ports.currentProjectId();
      const expectedTabId = ports.activeTabId();
      schedule(() => void ports.runCachedDiagram(sequence, projectId, analysis, expectedTabId), delay);
    },

    scheduleLiveSyntaxCheck(sources = ports.defaultSyntaxSources()) {
      const request = ++liveSyntaxSequence;
      void ports.checkSyntax(sources).then((diagnostics) => {
        if (request !== liveSyntaxSequence) {
          return;
        }
        updateLocalDiagnostics(sources.map((source) => source.sourceIdentity), diagnostics);
      });
    },

    isCurrentLink(sequence, projectId) {
      return sequence === linkSequence
        && (projectId === undefined || projectId === ports.currentProjectId());
    },

    updateLinkerDiagnostics(diagnostics, preflightSources = []) {
      const state = ports.readDiagnostics();
      ports.writeDiagnostics({
        local: preflightSources.length === 0
          ? state.local
          : omitDiagnostics(state.local, preflightSources),
        linker: diagnosticsBySource(diagnostics)
      });
    },

    updateLocalDiagnostics,

    removeDiagnostics(sources) {
      const state = ports.readDiagnostics();
      ports.writeDiagnostics({
        local: omitDiagnostics(state.local, sources),
        linker: omitDiagnostics(state.linker, sources)
      });
    },

    diagnosticsFor(tab) {
      const state = ports.readDiagnostics();
      return uniqueDiagnostics([
        ...(state.linker[tab.sourceIdentity] ?? []),
        ...(state.local[tab.sourceIdentity] ?? [])
      ]);
    },

    cancelCurrent() {
      linkSequence += 1;
      cancelScheduled();
    },

    reset,

    dispose() {
      linkSequence += 1;
      liveSyntaxSequence += 1;
      cancelScheduled();
    }
  };
}
