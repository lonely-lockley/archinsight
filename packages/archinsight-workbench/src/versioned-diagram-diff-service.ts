import type {
  AttributedDiagramDiff,
  VersionedRepository,
} from '@archinsight/contracts';
import {
  diffRenderGraphs,
  type DiagramDiff,
  type ProjectSource,
  type RenderGraph,
} from '@insight/language';

export interface SemanticVersionedDiagramDiff<TRevision> {
  readonly beforeRevision: string;
  readonly afterRevision: string;
  readonly before: TRevision;
  readonly after: TRevision;
  readonly diff: DiagramDiff;
}

export type VersionedModelComparison<TRevision> = Omit<SemanticVersionedDiagramDiff<TRevision>, 'diff'>;

export interface LoadVersionedModelComparisonOptions<TRevision> {
  readonly repository: VersionedRepository;
  readonly beforeRevision: string;
  readonly afterRevision: string;
  readonly signal: AbortSignal;
  readonly buildRevision: (
    sources: readonly ProjectSource[],
    revision: string,
  ) => TRevision | Promise<TRevision>;
  readonly validateRevision?: (
    revision: TRevision,
    side: 'before' | 'after',
  ) => void | Promise<void>;
}

export interface BuildVersionedDiagramDiffOptions<TRevision>
  extends LoadVersionedModelComparisonOptions<TRevision> {
  readonly selectGraph: (
    revision: TRevision,
    side: 'before' | 'after',
  ) => RenderGraph | undefined | Promise<RenderGraph | undefined>;
}

export async function buildVersionedDiagramDiff<TRevision>(
  options: BuildVersionedDiagramDiffOptions<TRevision>,
): Promise<SemanticVersionedDiagramDiff<TRevision>> {
  const comparison = await loadVersionedModelComparison(options);
  return projectVersionedDiagramDiff(comparison, options.selectGraph);
}

export async function loadVersionedModelComparison<TRevision>(
  options: LoadVersionedModelComparisonOptions<TRevision>,
): Promise<VersionedModelComparison<TRevision>> {
  await options.repository.validatePair(options.beforeRevision, options.afterRevision, options.signal);
  const [beforeSources, afterSources] = await Promise.all([
    options.repository.readProjectAt(options.beforeRevision, options.signal),
    options.repository.readProjectAt(options.afterRevision, options.signal),
  ]);
  const [before, after] = await Promise.all([
    options.buildRevision(beforeSources, options.beforeRevision),
    options.buildRevision(afterSources, options.afterRevision),
  ]);
  if (options.validateRevision !== undefined) {
    await Promise.all([
      Promise.resolve().then(() => options.validateRevision!(before, 'before')),
      Promise.resolve().then(() => options.validateRevision!(after, 'after')),
    ]);
  }
  return {
    beforeRevision: options.beforeRevision,
    afterRevision: options.afterRevision,
    before,
    after,
  };
}

export async function projectVersionedDiagramDiff<TRevision>(
  comparison: VersionedModelComparison<TRevision>,
  selectGraph: (
    revision: TRevision,
    side: 'before' | 'after',
  ) => RenderGraph | undefined | Promise<RenderGraph | undefined>,
): Promise<SemanticVersionedDiagramDiff<TRevision>> {
  const [beforeGraph, afterGraph] = await Promise.all([
    selectGraph(comparison.before, 'before'),
    selectGraph(comparison.after, 'after'),
  ]);
  if (beforeGraph === undefined && afterGraph === undefined) {
    throw new Error('The selected source is absent from both revisions');
  }
  const diff = diffRenderGraphs(
    beforeGraph ?? emptyGraph(afterGraph!.context),
    afterGraph ?? emptyGraph(beforeGraph!.context),
  );
  return {
    ...comparison,
    diff,
  };
}

export async function attributeVersionedDiagramDiff<TRevision>(
  repository: VersionedRepository,
  semantic: SemanticVersionedDiagramDiff<TRevision>,
  signal: AbortSignal,
): Promise<AttributedDiagramDiff> {
  const result = await repository.attribute({
    before: semantic.beforeRevision,
    after: semantic.afterRevision,
    origins: changedDiagramDiffOrigins(semantic.diff),
  }, signal);
  return {
    schemaVersion: 'attributed-diagram-diff.v1',
    revisions: { before: semantic.beforeRevision, after: semantic.afterRevision },
    diff: semantic.diff,
    ...result,
  };
}

export function changedDiagramDiffOrigins(
  diff: DiagramDiff,
): Readonly<Record<string, readonly import('@insight/language').DiagramDiffOrigin[]>> {
  return Object.fromEntries([
    ...Object.values(diff.elements),
    ...diff.edges,
    ...Object.values(diff.groups),
  ].filter((entry) => entry.status !== 'unchanged').map((entry) => [entry.changeId, entry.origins]));
}

function emptyGraph(context: string): RenderGraph {
  return { context, elements: {}, edges: [], groups: [], externalElements: [] };
}
