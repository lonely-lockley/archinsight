import { describe, expect, it } from 'vitest';
import type { DiagramQuickActionMetadata } from '@insight/language';
import {
  beginIsolate,
  beginFindPath,
  cancelIsolate,
  cancelFindPath,
  idleFindPathMode,
  quickActionItems,
  reverseFindPathResult,
  resolveFindPathTarget,
  retryFindPathTarget,
  showResolvedFindPath
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
  it('resolves visible enabled and disabled actions from semantic metadata', () => {
    expect(quickActionItems(metadata, 'shop/api')).toEqual([
      expect.objectContaining({ id: 'isolate', label: 'Isolate', enabled: true }),
      expect.objectContaining({ id: 'show-deployment', enabled: false, disabledReason: 'No deployment' }),
      expect.objectContaining({ id: 'go-to-declaration', enabled: true }),
      expect.objectContaining({ id: 'find-path', enabled: true })
    ]);
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
    expect(cancelIsolate(showing)).toEqual({ status: 'idle' });
  });

  it('keeps source identity while selecting, resolving, showing and retrying a path', () => {
    const selecting = beginFindPath(metadata['shop/api']!);
    expect(selecting).toEqual({ status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' });
    expect(resolveFindPathTarget(selecting, metadata['shop/api']!)).toBe(selecting);
    const resolving = resolveFindPathTarget(selecting, metadata['shop/db']!);
    expect(resolving).toEqual({
      status: 'resolving-path',
      sourceId: 'shop/api',
      sourceTitle: 'API',
      targetId: 'shop/db',
      targetTitle: 'Database'
    });
    expect(showResolvedFindPath(resolving).status).toBe('showing-path');
    expect(reverseFindPathResult(showResolvedFindPath(resolving))).toEqual({
      status: 'resolving-path',
      sourceId: 'shop/db',
      sourceTitle: 'Database',
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
});
