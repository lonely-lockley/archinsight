import type { LinkProjectResult } from '@insight/language';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '$lib/api';
import {
  createAnalysisController,
  type AnalysisControllerPorts,
  type AnalysisDiagnosticsState,
  type AnalysisSource
} from './analysis-controller';

const diagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  source: 'main.ai',
  level: 'ERROR',
  code: 'E001',
  message: 'Broken source',
  line: 1,
  column: 0,
  ...overrides
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((accept) => {
      resolve = accept;
    }),
    resolve
  };
}

function harness() {
  let nextHandle = 1;
  let projectId = 'project-a';
  let linkedAnalysis: LinkProjectResult | undefined;
  let diagnostics: AnalysisDiagnosticsState = { local: {}, linker: {} };
  const scheduled = new Map<number, { readonly task: () => void; readonly delay: number }>();
  const runLink = vi.fn();
  const runCachedDiagram = vi.fn();
  const checkSyntax = vi.fn<AnalysisControllerPorts['checkSyntax']>().mockResolvedValue([]);
  const clearLinkedAnalysis = vi.fn(() => {
    linkedAnalysis = undefined;
  });
  const closeDeploymentPicker = vi.fn();
  const defaultSources: AnalysisSource[] = [{ sourceIdentity: 'main.ai', content: 'Main' }];

  const controller = createAnalysisController({
    schedule(task, delay) {
      const handle = nextHandle++;
      scheduled.set(handle, { task, delay });
      return handle;
    },
    cancel(handle) {
      scheduled.delete(handle);
    },
    currentProjectId: () => projectId,
    linkedAnalysis: () => linkedAnalysis,
    clearLinkedAnalysis,
    closeDeploymentPicker,
    runLink,
    runCachedDiagram,
    checkSyntax,
    defaultSyntaxSources: () => defaultSources,
    readDiagnostics: () => diagnostics,
    writeDiagnostics: (next) => {
      diagnostics = next;
    }
  });

  return {
    controller,
    scheduled,
    runLink,
    runCachedDiagram,
    checkSyntax,
    clearLinkedAnalysis,
    closeDeploymentPicker,
    diagnostics: () => diagnostics,
    setProjectId: (value: string) => {
      projectId = value;
    },
    setLinkedAnalysis: (value: LinkProjectResult | undefined) => {
      linkedAnalysis = value;
    },
    runOnlyScheduled() {
      expect(scheduled.size).toBe(1);
      const [handle, entry] = [...scheduled.entries()][0]!;
      scheduled.delete(handle);
      entry.task();
      return entry.delay;
    }
  };
}

describe('analysis controller', () => {
  it('debounces link requests and runs only the latest generation', () => {
    const test = harness();

    test.controller.scheduleLink(250);
    test.controller.scheduleLink(10);

    expect(test.scheduled.size).toBe(1);
    expect(test.runOnlyScheduled()).toBe(10);
    expect(test.runLink).toHaveBeenCalledOnce();
    expect(test.runLink).toHaveBeenCalledWith(2);
    expect(test.clearLinkedAnalysis).toHaveBeenCalledTimes(2);
    expect(test.closeDeploymentPicker).toHaveBeenCalledTimes(2);
  });

  it('schedules a cached diagram with analysis and project snapshots', () => {
    const test = harness();
    const analysis = { contexts: [] } as unknown as LinkProjectResult;
    test.setLinkedAnalysis(analysis);

    test.controller.scheduleDiagramUpdate();
    test.setProjectId('project-b');

    expect(test.runOnlyScheduled()).toBe(0);
    expect(test.runCachedDiagram).toHaveBeenCalledWith(1, 'project-a', analysis);
    expect(test.runLink).not.toHaveBeenCalled();
  });

  it('falls back to linking when no cached analysis exists', () => {
    const test = harness();

    test.controller.scheduleDiagramUpdate();

    expect(test.runOnlyScheduled()).toBe(500);
    expect(test.runLink).toHaveBeenCalledWith(1);
    expect(test.runCachedDiagram).not.toHaveBeenCalled();
  });

  it('rejects stale link generations and project snapshots', () => {
    const test = harness();
    test.controller.scheduleLink();

    expect(test.controller.isCurrentLink(1, 'project-a')).toBe(true);
    expect(test.controller.isCurrentLink(0, 'project-a')).toBe(false);
    expect(test.controller.isCurrentLink(1, 'project-b')).toBe(false);

    test.setProjectId('project-b');
    expect(test.controller.isCurrentLink(1, 'project-a')).toBe(false);
  });

  it('merges local diagnostics and replaces linker diagnostics', () => {
    const test = harness();
    const oldMain = diagnostic({ code: 'OLD' });
    const untouched = diagnostic({ source: 'other.ai', code: 'OTHER' });
    test.controller.updateLocalDiagnostics(['main.ai', 'other.ai'], [oldMain, untouched]);

    const localMain = diagnostic({ code: 'LOCAL' });
    test.controller.updateLocalDiagnostics(['main.ai'], [localMain]);
    const linkerMain = diagnostic({ code: 'LINKER' });
    test.controller.updateLinkerDiagnostics([linkerMain], ['main.ai']);

    expect(test.diagnostics()).toEqual({
      local: { 'other.ai': [untouched] },
      linker: { 'main.ai': [linkerMain] }
    });
    expect(test.controller.diagnosticsFor({ sourceIdentity: 'main.ai' })).toEqual([linkerMain]);
  });

  it('deduplicates diagnostics shared by local and linker layers', () => {
    const test = harness();
    const shared = diagnostic();
    test.controller.updateLocalDiagnostics(['main.ai'], [shared]);
    test.controller.updateLinkerDiagnostics([shared]);

    expect(test.controller.diagnosticsFor({ sourceIdentity: 'main.ai' })).toEqual([shared]);
  });

  it('removes deleted or retargeted sources from both diagnostic layers', () => {
    const test = harness();
    const main = diagnostic();
    const other = diagnostic({ source: 'other.ai', code: 'OTHER' });
    test.controller.updateLocalDiagnostics(['main.ai', 'other.ai'], [main, other]);
    test.controller.updateLinkerDiagnostics([main, other]);

    test.controller.removeDiagnostics(['main.ai']);

    expect(test.diagnostics()).toEqual({
      local: { 'other.ai': [other] },
      linker: { 'other.ai': [other] }
    });
  });

  it('accepts only the latest live syntax result', async () => {
    const test = harness();
    const first = deferred<Diagnostic[]>();
    const second = deferred<Diagnostic[]>();
    test.checkSyntax
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    test.controller.scheduleLiveSyntaxCheck([{ sourceIdentity: 'first.ai', content: 'First' }]);
    test.controller.scheduleLiveSyntaxCheck([{ sourceIdentity: 'second.ai', content: 'Second' }]);
    first.resolve([diagnostic({ source: 'first.ai' })]);
    await first.promise;
    second.resolve([diagnostic({ source: 'second.ai' })]);
    await second.promise;

    expect(test.diagnostics().local).toEqual({
      'second.ai': [diagnostic({ source: 'second.ai' })]
    });
  });

  it('uses default sources for live syntax checks', async () => {
    const test = harness();

    test.controller.scheduleLiveSyntaxCheck();
    await Promise.resolve();

    expect(test.checkSyntax).toHaveBeenCalledWith([{ sourceIdentity: 'main.ai', content: 'Main' }]);
  });

  it('reset cancels scheduled work, clears diagnostics and invalidates pending syntax', async () => {
    const test = harness();
    const pending = deferred<Diagnostic[]>();
    test.checkSyntax.mockReturnValueOnce(pending.promise);
    test.controller.updateLocalDiagnostics(['main.ai'], [diagnostic()]);
    test.controller.updateLinkerDiagnostics([diagnostic({ code: 'LINKER' })]);
    test.controller.scheduleLink();
    test.controller.scheduleLiveSyntaxCheck();

    test.controller.reset();
    pending.resolve([diagnostic({ code: 'STALE' })]);
    await pending.promise;

    expect(test.scheduled.size).toBe(0);
    expect(test.diagnostics()).toEqual({ local: {}, linker: {} });
    expect(test.clearLinkedAnalysis).toHaveBeenCalledTimes(2);
  });

  it('dispose cancels callbacks without mutating diagnostics', () => {
    const test = harness();
    test.controller.updateLocalDiagnostics(['main.ai'], [diagnostic()]);
    test.controller.scheduleLink();

    test.controller.dispose();

    expect(test.scheduled.size).toBe(0);
    expect(test.diagnostics().local['main.ai']).toHaveLength(1);
  });
});
