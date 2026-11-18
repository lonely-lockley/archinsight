import { describe, expect, it } from 'vitest';
import {
  DiagramQuickActionCoordinator,
  DiagramQuickActionStack
} from '@archinsight/workbench/diagram-quick-action-coordinator';

describe('DiagramQuickActionCoordinator', () => {
  it('pops composed diagram transitions one level at a time', () => {
    const stack = new DiagramQuickActionStack<string, string>();
    stack.push({
      mode: { status: 'showing-drill-down', elementId: 'shop', elementTitle: 'Shop' },
      snapshot: 'base',
      projection: 'c2'
    });
    stack.push({
      mode: { status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API' },
      snapshot: 'c2-preview',
      projection: 'isolated-c2'
    });
    expect(stack.depth()).toBe(2);
    expect(stack.currentSnapshot()).toBe('c2-preview');
    expect(stack.currentProjection()).toBe('isolated-c2');
    expect(stack.pop()).toEqual({
      snapshot: 'c2-preview',
      mode: { status: 'showing-drill-down', elementId: 'shop', elementTitle: 'Shop' }
    });
    expect(stack.pop()).toEqual({ snapshot: 'base', mode: undefined });
    expect(stack.pop()).toBeUndefined();
  });

  it('stores every rendered quick-action mode and replaces the current result in place', () => {
    const stack = new DiagramQuickActionStack<string, string>();
    stack.push({
      mode: {
        status: 'showing-path', sourceId: 'shop/api', sourceTitle: 'API',
        targetId: 'shop/db', targetTitle: 'Database', scope: { view: 'c2' }
      },
      snapshot: 'base',
      projection: 'path'
    });
    stack.push({
      mode: {
        status: 'showing-deployment', elementId: 'shop/api', elementTitle: 'API',
        environment: 'eu', focusElementIds: ['shop/api']
      },
      snapshot: 'path-preview',
      projection: 'deployment-eu'
    });

    expect(stack.replaceCurrent({
      status: 'showing-deployment', elementId: 'shop/api', elementTitle: 'API',
      environment: 'us', focusElementIds: ['shop/api']
    }, 'deployment-us')).toBe(true);
    expect(stack.currentProjection()).toBe('deployment-us');
    expect(stack.pop()).toEqual({
      snapshot: 'path-preview',
      mode: expect.objectContaining({ status: 'showing-path', sourceId: 'shop/api' })
    });
  });

  it('keeps quick-action ownership in one lifecycle', () => {
    const coordinator = new DiagramQuickActionCoordinator();
    coordinator.begin('isolate', { id: 'tab-1', sourceIdentity: 'model.ai' });
    expect(coordinator.owns('isolate', 'tab-1')).toBe(true);
    expect(coordinator.owns('isolate', 'tab-2')).toBe(false);
    expect(coordinator.belongsToSource('isolate', 'model.ai')).toBe(true);
  });

  it('clears individual and project-wide transient lifecycles', () => {
    const coordinator = new DiagramQuickActionCoordinator();
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
    coordinator.begin('find-path', {});
    coordinator.begin('deployment', {});
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
