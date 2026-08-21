import type { EnvSource } from '$lib/server/auth/auth-config';

export type AnalysisMetric =
  | 'fullSnapshotBuilds'
  | 'fullProjectLinks'
  | 'incrementalSourceUpdates'
  | 'incrementalSourcesRelinked'
  | 'cacheHits'
  | 'cacheMisses'
  | 'queryDotGenerations'
  | 'graphvizRenders';

const counters: Record<AnalysisMetric, number> = {
  fullSnapshotBuilds: 0,
  fullProjectLinks: 0,
  incrementalSourceUpdates: 0,
  incrementalSourcesRelinked: 0,
  cacheHits: 0,
  cacheMisses: 0,
  queryDotGenerations: 0,
  graphvizRenders: 0
};

export function incrementAnalysisMetric(metric: AnalysisMetric, amount = 1): void {
  counters[metric] += amount;
}

export function analysisMetricsSnapshot(): Readonly<Record<AnalysisMetric, number>> {
  return { ...counters };
}

export function resetAnalysisMetrics(): void {
  for (const metric of Object.keys(counters) as AnalysisMetric[]) {
    counters[metric] = 0;
  }
}

export function observeAnalysis(
  env: EnvSource | undefined,
  event: string,
  fields: Readonly<Record<string, string | number | boolean | undefined>>
): void {
  if ((env?.NODE_ENV ?? process.env.NODE_ENV) === 'test') {
    return;
  }
  console.info(JSON.stringify({ event, ...fields }));
}
