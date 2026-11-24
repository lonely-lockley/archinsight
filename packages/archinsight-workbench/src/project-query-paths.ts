export function isQueryFile(path: string): boolean {
  return path.endsWith('.aiq');
}

export function queryFileName(path: string): string {
  return (path.split('/').at(-1) ?? path).slice(0, -4);
}

/** Query identities are basenames and duplicate paths remain visible to callers. */
export function groupProjectQueryPaths(paths: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const byName = new Map<string, string[]>();
  for (const path of paths.filter(isQueryFile)) {
    const name = queryFileName(path);
    byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  return new Map([...byName].sort(([a], [b]) => a.localeCompare(b)).map(([name, matches]) => [
    name,
    [...new Set(matches)].sort(),
  ]));
}
