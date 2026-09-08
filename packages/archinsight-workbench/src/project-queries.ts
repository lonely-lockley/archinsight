import { resolveBuiltinView, type BuiltinDiagramView } from '@insight/language';
import type { TreeNode, WorkspaceTab } from './workspace-types';

export type ProjectQuery = {
  readonly name: string;
  readonly paths: readonly string[];
  readonly view?: BuiltinDiagramView;
};

export function isQueryFile(path: string): boolean {
  return path.endsWith('.aiq');
}

export function queryFileName(path: string): string {
  return (path.split('/').at(-1) ?? path).slice(0, -4);
}

export function projectFilePaths(tree: TreeNode | undefined): string[] {
  if (tree === undefined) return [];
  return tree.type === 'file' ? [tree.path] : tree.children.flatMap(projectFilePaths);
}

/** Basenames are project-wide identities, independent of directory and traversal order. */
export function discoverProjectQueries(tree: TreeNode | undefined): ProjectQuery[] {
  const byName = new Map<string, string[]>();
  for (const path of projectFilePaths(tree).filter(isQueryFile)) {
    const name = queryFileName(path);
    byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  return [...byName].sort(([a], [b]) => a.localeCompare(b)).map(([name, paths]) => ({
    name,
    paths: [...new Set(paths)].sort(),
    // Reserve stable IDs, not display labels or compatibility aliases.
    view: resolveBuiltinView(name, true)?.id === name ? resolveBuiltinView(name, true)!.id : undefined
  }));
}

export function selectedQueryName(tab: WorkspaceTab): string | undefined {
  if (isQueryFile(tab.sourceIdentity)) return queryFileName(tab.sourceIdentity);
  if (tab.queryView !== undefined) return tab.queryView;
  return tab.queryPreset ? resolveBuiltinView(tab.diagramMode, true)?.id : undefined;
}

export function resolveProjectQuery(tab: WorkspaceTab, queries: readonly ProjectQuery[]): ProjectQuery | undefined {
  const name = selectedQueryName(tab);
  const query = queries.find((item) => item.name === name);
  if (query !== undefined && query.paths.length > 1) {
    throw new Error(`Query name '${name}' is ambiguous: ${query.paths.join(', ')}`);
  }
  if (query === undefined && tab.queryView !== undefined) {
    throw new Error(`Query file '${tab.queryView}.aiq' was not found`);
  }
  return query;
}
