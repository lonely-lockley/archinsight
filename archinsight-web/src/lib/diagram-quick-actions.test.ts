import { describe, expect, it } from 'vitest';
import type { DiagramQuickActionMetadata } from '@insight/language';
import {
  beginDeployment,
  beginIsolate,
  beginFindPath,
  cancelFindPath,
  clearTransientDiagramResult,
  diagramQuickActionResultKind,
  idleFindPathMode,
  idleTransientDiagramResult,
  quickActionItems,
  quickActionRadialOffsets,
  reverseFindPathResult,
  resolveFindPathTarget,
  retryFindPathTarget,
  showResolvedFindPath,
  showTransientDiagramResult
} from '@archinsight/workbench/diagram-quick-actions';

const metadata: DiagramQuickActionMetadata = {
  'shop/api': {
    elementId: 'shop/api',
    canonicalElementId: 'shop/api',
    title: 'API',
    hasChildren: true,
    hasDeployment: false,
    declaration: { sourceName: 'model.ai', line: 4, column: 5 },
    isolateEligible: true,
    pathEligible: true
  },
  'shop/db': {
    elementId: 'shop/db',
    canonicalElementId: 'shop/db',
    title: 'Database',
    hasChildren: false,
    hasDeployment: true,
    isolateEligible: true,
    pathEligible: true
  }
};

describe('diagram quick action model', () => {
  it('fans radial actions inward without moving their trigger anchor', () => {
    const viewport = { left: 100, top: 50, right: 420, bottom: 250 };
    const centered = quickActionRadialOffsets(5, { x: 240, y: 160 }, viewport);
    expect(centered[0]).toEqual({ x: 0, y: -52 });

    const rightEdge = quickActionRadialOffsets(5, { x: 410, y: 160 }, viewport);
    expect(rightEdge.every((offset) => offset.x <= -20)).toBe(true);
    expect(rightEdge[0]).toEqual({ x: -20, y: -52 });
    expect(rightEdge[4]?.x).toBeCloseTo(-20);
    expect(rightEdge[4]?.y).toBeCloseTo(52);

    const topRightCorner = quickActionRadialOffsets(5, { x: 410, y: 60 }, viewport);
    expect(topRightCorner.every((offset) => offset.x <= -19.999 && offset.y >= 19.999)).toBe(true);
    expect(topRightCorner[0]?.x).toBeCloseTo(-112);
    expect(topRightCorner[0]?.y).toBeCloseTo(20);
    expect(topRightCorner[4]?.x).toBeCloseTo(-20);
    expect(topRightCorner[4]?.y).toBeCloseTo(112);
  });

  it('resolves visible enabled and disabled actions from semantic metadata', () => {
    expect(quickActionItems(metadata, 'shop/api')).toEqual([
      expect.objectContaining({ id: 'drill-down', label: 'Drill down', enabled: true }),
      expect.objectContaining({ id: 'isolate', label: 'Isolate', enabled: true }),
      expect.objectContaining({ id: 'show-deployment', enabled: false, disabledReason: 'No deployment' }),
      expect.objectContaining({ id: 'go-to-declaration', enabled: true }),
      expect.objectContaining({ id: 'find-path', enabled: true }),
      expect.objectContaining({ id: 'diff', enabled: false })
    ]);
    expect(quickActionItems(metadata, 'shop/api').find((item) => item.id === 'diff'))
      .not.toHaveProperty('disabledReason');
    expect(quickActionItems(metadata, 'shop/api', { versioning: true }))
      .toContainEqual(expect.objectContaining({ id: 'diff', enabled: true }));
    expect(quickActionItems(metadata, 'shop/api', { versioning: true, declarationNavigation: false }))
      .toContainEqual(expect.objectContaining({ id: 'go-to-declaration', enabled: false }));
    expect(quickActionItems(metadata, 'shop/db', { versioning: true }))
      .toContainEqual(expect.objectContaining({ id: 'diff', enabled: false }));
    expect(quickActionItems(metadata, 'shop/db'))
      .toContainEqual(expect.objectContaining({ id: 'drill-down', enabled: false }));
    expect(quickActionItems(metadata, 'shop/db').find((action) => action.id === 'drill-down'))
      .not.toHaveProperty('disabledReason');
    expect(quickActionItems(metadata, 'shop/api@@production')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'isolate', enabled: true })])
    );
    expect(quickActionItems(metadata, 'missing')).toEqual([]);
  });

  it('tracks an isolated element until the result is closed', () => {
    const showing = beginIsolate(metadata['shop/api']!);
    expect(showing).toEqual({
      status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API'
    });
  });

  it('tracks a deployment result and its environment until the result is closed', () => {
    const showing = beginDeployment(metadata['shop/db']!, 'eu');
    expect(showing).toEqual({
      status: 'showing-deployment', elementId: 'shop/db', elementTitle: 'Database', environment: 'eu',
      focusElementIds: ['shop/db']
    });
  });

  it('maps every rendered quick-action mode to its shared result kind', () => {
    expect(diagramQuickActionResultKind(beginIsolate(metadata['shop/api']!))).toBe('isolate');
    const deployment = beginDeployment(metadata['shop/db']!, 'eu');
    if (deployment.status !== 'showing-deployment') throw new Error('Expected deployment result');
    expect(diagramQuickActionResultKind(deployment)).toBe('deployment');
    const selecting = beginFindPath(metadata['shop/api']!, { view: 'c2' });
    const resolving = resolveFindPathTarget(selecting, metadata['shop/db']!);
    const showing = showResolvedFindPath(resolving);
    if (showing.status !== 'showing-path') throw new Error('Expected path result');
    expect(diagramQuickActionResultKind(showing)).toBe('find-path');
  });

  it('keeps source identity while selecting, resolving, showing and retrying a path', () => {
    const scope = { view: 'c2', tab: 'model.ai', context: 'shop' } as const;
    const selecting = beginFindPath(metadata['shop/api']!, scope);
    expect(selecting).toEqual({ status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API', scope });
    expect(resolveFindPathTarget(selecting, metadata['shop/api']!)).toBe(selecting);
    const resolving = resolveFindPathTarget(selecting, metadata['shop/db']!);
    expect(resolving).toEqual({
      status: 'resolving-path',
      sourceId: 'shop/api',
      sourceTitle: 'API',
      scope,
      targetId: 'shop/db',
      targetTitle: 'Database'
    });
    expect(showResolvedFindPath(resolving).status).toBe('showing-path');
    expect(reverseFindPathResult(showResolvedFindPath(resolving))).toEqual({
      status: 'resolving-path',
      sourceId: 'shop/db',
      sourceTitle: 'Database',
      scope,
      targetId: 'shop/api',
      targetTitle: 'API'
    });
    expect(reverseFindPathResult(resolving)).toBe(resolving);
    expect(showResolvedFindPath(idleFindPathMode)).toBe(idleFindPathMode);
    expect(retryFindPathTarget(resolving)).toEqual(selecting);
    expect(retryFindPathTarget(showResolvedFindPath(resolving))).toEqual(selecting);
    expect(retryFindPathTarget(idleFindPathMode)).toBe(idleFindPathMode);
    expect(resolveFindPathTarget(idleFindPathMode, metadata['shop/db']!)).toBe(idleFindPathMode);
    const incompatible = { ...metadata['shop/db']!, pathEligible: false };
    expect(resolveFindPathTarget(selecting, incompatible)).toBe(selecting);
    expect(cancelFindPath(cancelFindPath(selecting))).toBe(idleFindPathMode);
  });

  it('keeps endpoint environments through resolve, reverse and retry', () => {
    const scope = {
      context: 'shop',
      tab: 'model.ai',
      view: 'deployment-container',
      environment: 'eu'
    } as const;
    const selecting = beginFindPath(metadata['shop/api']!, scope, 'eu');
    const resolving = resolveFindPathTarget(selecting, metadata['shop/db']!, 'us');
    expect(resolving).toEqual({
      status: 'resolving-path',
      sourceId: 'shop/api',
      sourceTitle: 'API',
      sourceEnvironment: 'eu',
      scope,
      targetId: 'shop/db',
      targetTitle: 'Database',
      targetEnvironment: 'us'
    });
    expect(reverseFindPathResult(showResolvedFindPath(resolving))).toEqual({
      status: 'resolving-path',
      sourceId: 'shop/db',
      sourceTitle: 'Database',
      sourceEnvironment: 'us',
      targetId: 'shop/api',
      targetTitle: 'API',
      targetEnvironment: 'eu',
      scope
    });
    expect(retryFindPathTarget(resolving)).toEqual({
      status: 'selecting-target',
      sourceId: 'shop/api',
      sourceTitle: 'API',
      sourceEnvironment: 'eu',
      scope
    });
  });

  it('tracks each transient diagram result explicitly instead of collapsing them to a boolean', () => {
    expect(idleTransientDiagramResult).toEqual({ status: 'idle' });
    expect(showTransientDiagramResult('isolate')).toEqual({ status: 'visible', kind: 'isolate' });
    expect(showTransientDiagramResult('deployment')).toEqual({ status: 'visible', kind: 'deployment' });
    expect(showTransientDiagramResult('find-path')).toEqual({ status: 'visible', kind: 'find-path' });
    expect(showTransientDiagramResult('diff')).toEqual({ status: 'visible', kind: 'diff' });
    expect(clearTransientDiagramResult()).toBe(idleTransientDiagramResult);
  });
});
