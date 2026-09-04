import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import { queryForDiagramMode } from '@archinsight/workbench/presets';
import { createDiagramController, type DiagramControllerPorts, emptyDiagramSvg } from './diagram-controller';
import type { LinkProjectResult } from '@insight/language';

const tab = (overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: 'main.ai', filePath: 'main.ai', sourceIdentity: 'main.ai', title: 'main.ai', content: '',
  svg: '<svg/>', dot: 'dot', diagnostics: [], local: false, diagramMode: 'default', query: '',
  queryPreset: true, queryVisible: false, queryPanelHeight: 118, diagramScale: 1,
  diagramFit: false, viewMode: 'split', editorSplitRatio: 50, ...overrides
});

function fixture(active: WorkspaceTab | undefined = tab()) {
  let current = active;
  let visibleScale = Number.NaN;
  let refreshDisabled = false;
  const scheduled = new Map<number, () => void>();
  let nextHandle = 0;
  const ports: DiagramControllerPorts = {
    activeTab: () => current,
    linkedAnalysis: () => undefined,
    pickerOpen: () => false,
    setPickerOpen: vi.fn(),
    refreshDisabled: () => refreshDisabled,
    setRefreshDisabled: vi.fn((value) => { refreshDisabled = value; }),
    visibleScale: () => visibleScale,
    setVisibleScale: vi.fn((value) => { visibleScale = value; }),
    patchActiveTab: vi.fn((patch) => { if (current !== undefined) current = { ...current, ...patch }; }),
    persistWorkspace: vi.fn(),
    scheduleLink: vi.fn(),
    scheduleDiagramUpdate: vi.fn(),
    deferEditorLayout: vi.fn(),
    schedule: vi.fn((task) => { const handle = ++nextHandle; scheduled.set(handle, task); return handle; }),
    cancel: vi.fn((handle) => { scheduled.delete(handle); })
  };
  return { ports, controller: createDiagramController(ports), tab: () => current, runTimers: () => {
    for (const task of scheduled.values()) task();
    scheduled.clear();
  } };
}

describe('diagram controller', () => {
  it('updates custom queries and schedules a cached diagram refresh', () => {
    const subject = fixture();
    subject.controller.updateQuery('custom query');
    expect(subject.tab()).toMatchObject({ query: 'custom query', queryPreset: false, dot: undefined });
    expect(subject.ports.persistWorkspace).toHaveBeenCalledOnce();
    expect(subject.ports.scheduleDiagramUpdate).toHaveBeenCalledOnce();
  });

  it('keeps manually edited text customized even when it equals a preset', () => {
    const subject = fixture(tab({ diagramMode: 'c2' }));
    subject.controller.updateQuery(queryForDiagramMode('c2'));
    expect(subject.tab()).toMatchObject({ diagramMode: 'c2', queryPreset: false });
  });

  it('requests a link before selecting deployment environments', () => {
    const subject = fixture();
    subject.controller.selectMode('deployment-container');
    expect(subject.tab()).toMatchObject({ diagramMode: 'deployment-container', queryPreset: true, dot: undefined });
    expect(subject.ports.scheduleLink).toHaveBeenCalledWith(0);
  });

  it('handles deployment selection without a relevant environment', () => {
    const subject = fixture(tab({ diagramMode: 'deployment-container' }));
    expect(subject.controller.deploymentEnvironmentsFor()).toEqual([]);
    subject.controller.selectDeploymentEnvironment(undefined);
    expect(subject.tab()?.svg).toContain('No deployment environments');
    expect(subject.ports.scheduleDiagramUpdate).not.toHaveBeenCalled();
    subject.controller.closeDeploymentPicker();
    expect(subject.ports.setPickerOpen).toHaveBeenLastCalledWith(false);

    const nonDeployment = fixture();
    expect(nonDeployment.controller.reconcileDeploymentEnvironment({} as LinkProjectResult)).toBe(false);
  });

  it('applies zoom limits, fit, and actual size', () => {
    const subject = fixture(tab({ diagramScale: 2.9 }));
    subject.controller.zoom(1);
    expect(subject.tab()).toMatchObject({ diagramScale: 3, diagramFit: false });
    subject.controller.fit();
    expect(subject.tab()?.diagramFit).toBe(true);
    subject.controller.actualSize();
    expect(subject.tab()).toMatchObject({ diagramScale: 1, diagramFit: false });
  });

  it('clamps split and visible scale independently', () => {
    const subject = fixture();
    subject.controller.updateEditorSplitRatio(5);
    subject.controller.updateVisibleScale(10);
    expect(subject.tab()?.editorSplitRatio).toBe(20);
    expect(subject.ports.setVisibleScale).toHaveBeenCalledWith(3);
  });

  it('toggles query and view while deferring editor layout', () => {
    const subject = fixture();
    subject.controller.toggleQuery();
    subject.controller.selectViewMode('diagram');
    subject.controller.updateQueryPanelHeight(220);
    expect(subject.tab()).toMatchObject({ queryVisible: true, viewMode: 'diagram', queryPanelHeight: 220 });
    expect(subject.ports.deferEditorLayout).toHaveBeenCalledTimes(3);
  });

  it('debounces refresh attempts through the cooldown and resets it', () => {
    const subject = fixture();
    subject.controller.refresh();
    subject.controller.refresh();
    expect(subject.ports.scheduleDiagramUpdate).toHaveBeenCalledOnce();
    subject.runTimers();
    subject.controller.refresh();
    expect(subject.ports.scheduleDiagramUpdate).toHaveBeenCalledTimes(2);
    subject.controller.reset();
    expect(subject.ports.setRefreshDisabled).toHaveBeenLastCalledWith(false);
    subject.controller.dispose();
  });

  it('produces an explicit empty diagram placeholder', () => {
    expect(emptyDiagramSvg('Nothing here')).toContain('Nothing here');
  });
});
