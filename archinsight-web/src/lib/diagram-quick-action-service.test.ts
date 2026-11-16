import { describe, expect, it } from 'vitest';
import { InsightLanguageService } from '@insight/language';
import { DiagramQuickActionService } from '@archinsight/workbench/diagram-quick-action-service';

const analysis = new InsightLanguageService().link({ sources: [{
  sourceName: 'model.ai',
  source: `context shop

system api
    name = API
    links:
        -> db

system db
    name = Database
`
}] });

describe('shared diagram quick action service', () => {
  it('prepares the same isolate and directed path semantics for every host', () => {
    const service = new DiagramQuickActionService(analysis);
    const scope = { context: 'shop', tab: 'model.ai', view: 'c1' } as const;
    const selecting = service.beginFindPath('shop/api', scope);
    expect(selecting?.status).toBe('selecting-target');
    const path = service.selectPathTarget(selecting!, 'shop/db');
    expect(path?.resolving.scope).toBe(scope);
    expect(path?.showing.status).toBe('showing-path');
    expect(path?.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(['shop/api->shop/db']);
    expect(service.reversePath(path!.showing)?.graph.edges).toHaveLength(0);

    const isolated = service.isolate('shop/api', scope);
    expect(isolated?.mode).toMatchObject({ status: 'showing-isolate', elementId: 'shop/api' });
    expect(Object.keys(isolated!.graph.elements).sort()).toEqual(['shop/api', 'shop/db']);
  });

  it('returns unavailable outcomes without requiring host-specific semantic checks', () => {
    const service = new DiagramQuickActionService(analysis);
    expect(service.metadata('missing')).toBeUndefined();
    expect(service.beginFindPath('missing', { view: 'c1' })).toBeUndefined();
    expect(service.selectPathTarget({ status: 'idle' }, 'shop/db')).toBeUndefined();
    expect(service.reversePath({ status: 'idle' })).toBeUndefined();
    expect(service.isolate('missing')).toBeUndefined();
    expect(service.deploymentEnvironments('shop/api')).toEqual([]);
    expect(service.deployment('shop/api', 'production')).toBeUndefined();
  });
});
