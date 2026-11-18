import { describe, expect, it } from 'vitest';
import {
  InsightLanguageService,
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject
} from '@insight/language';
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

const deploymentSnapshot = buildLanguageSnapshotResultFromSources([{
  sourceName: 'definitions.ai',
  source: `define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
    ClusterLink clusterLink

define type ClusterLink of NetworkConnection
    constructor clusterLink
`
}], [coreLanguageSnapshot]).snapshot;

const crossEnvironmentAnalysis = linkProject({
  snapshot: deploymentSnapshot,
  sources: [
    {
      sourceName: 'east.ai',
      source: `environment east
    name = East

deployment production
    compute:
        compute node
            name = East node
    clusterLink:
        clusterLink boundary
            name = Boundary
            projection:
                source $from originalLink target $to
`
    },
    {
      sourceName: 'west.ai',
      source: `environment west
    name = West

deployment production
    compute:
        compute node
            name = West node
    network:
        networkConnection internal
            name = Internal
            projection:
                source $from originalLink target $to
`
    },
    {
      sourceName: 'cross.ai',
      source: `context cross

deploymentProfile eastProfile
    appliesTo:
        production from east
    runsOn compute

deploymentProfile westProfile
    appliesTo:
        production from west
    runsOn compute

system application
    name = Application
    service source
        name = Source
        deployment:
            uses eastProfile
        links:
            -> bridge
                deployment:
                    uses clusterLink

    service bridge
        name = Bridge
        deployment:
            uses westProfile
        links:
            -> target
                deployment:
                    uses network

    service target
        name = Target
        deployment:
            uses westProfile
`
    }
  ]
});

describe('shared diagram quick action service', () => {
  it('drills into the next logical level and keeps its one-hop context folded', () => {
    const drilled = new DiagramQuickActionService(crossEnvironmentAnalysis).drillDown('cross/application');
    expect(drilled?.mode).toMatchObject({ status: 'showing-drill-down', elementId: 'cross/application' });
    expect(new Set(Object.keys(drilled?.graph.elements ?? {}))).toEqual(new Set([
      'cross/application', 'cross/source', 'cross/bridge', 'cross/target'
    ]));
  });

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
    expect(service.drillDown('shop/api')).toBeUndefined();
    expect(service.deploymentEnvironments('shop/api')).toEqual([]);
    expect(service.deployment('shop/api', 'production')).toBeUndefined();
  });

  it('finds a physical path between occurrences selected in different environments', () => {
    const service = new DiagramQuickActionService(crossEnvironmentAnalysis);
    const scope = {
      context: 'cross', tab: 'cross.ai', view: 'deployment-container', environment: 'east'
    } as const;
    const selecting = service.beginFindPath('cross/source', scope, 'east');
    const path = service.selectPathTarget(
      selecting!,
      'cross/target',
      'east',
    );

    expect(path?.resolving).toMatchObject({ sourceEnvironment: 'east', targetEnvironment: 'west' });
    expect(path?.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'cross/source->cross/bridge',
      'cross/bridge->cross/target'
    ]);
  });
});
