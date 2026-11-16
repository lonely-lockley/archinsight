import { describe, expect, it } from 'vitest';
import { DiagramQuickActionCoordinator } from '@archinsight/workbench/diagram-quick-action-coordinator';

describe('DiagramQuickActionCoordinator', () => {
  it('keeps owner and baseline in one lifecycle and restores a baseline once', () => {
    const coordinator = new DiagramQuickActionCoordinator<{ readonly svg: string }>();
    coordinator.begin('isolate', { id: 'tab-1', sourceIdentity: 'model.ai' }, { svg: 'before' });
    expect(coordinator.owns('isolate', 'tab-1')).toBe(true);
    expect(coordinator.owns('isolate', 'tab-2')).toBe(false);
    expect(coordinator.belongsToSource('isolate', 'model.ai')).toBe(true);
    coordinator.begin('isolate', { id: 'tab-1', sourceIdentity: 'model.ai' });
    expect(coordinator.takeBaseline('isolate')).toEqual({ svg: 'before' });
    expect(coordinator.takeBaseline('isolate')).toBeUndefined();
  });

  it('clears individual and project-wide transient lifecycles', () => {
    const coordinator = new DiagramQuickActionCoordinator<string>();
    coordinator.setFindPathMode({
      status: 'selecting-target',
      sourceId: 'shop/api',
      sourceTitle: 'API',
      scope: { context: 'shop', tab: 'model.ai', view: 'c1' }
    });
    coordinator.setIsolateMode({ status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API' });
    coordinator.setDeploymentMode({
      status: 'showing-deployment',
      elementId: 'shop/api',
      elementTitle: 'API',
      environment: 'production',
      focusElementIds: ['shop/api']
    });
    coordinator.begin('find-path', {}, 'path');
    coordinator.begin('deployment', {}, 'deployment');
    coordinator.clear('find-path');
    expect(coordinator.lifecycle('find-path')).toBeUndefined();
    expect(coordinator.lifecycle('deployment')).toBeDefined();
    const generation = coordinator.nextGeneration();
    expect(coordinator.isCurrent(generation)).toBe(true);
    coordinator.showResult('deployment');
    expect(coordinator.resultState()).toEqual({ status: 'visible', kind: 'deployment' });
    coordinator.reset();
    expect(coordinator.lifecycle('deployment')).toBeUndefined();
    expect(coordinator.findPathMode()).toEqual({ status: 'idle' });
    expect(coordinator.isolateMode()).toEqual({ status: 'idle' });
    expect(coordinator.deploymentMode()).toEqual({ status: 'idle' });
    expect(coordinator.isCurrent(generation)).toBe(false);
    expect(coordinator.resultState()).toEqual({ status: 'idle' });
  });
});
