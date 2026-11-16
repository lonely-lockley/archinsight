const ignoredSourceDirectoryNames = new Set(['node_modules', 'build', 'dist']);

/** Stable POSIX identity used by model sources across hosts and repositories. */
export function normalizeProjectSourceIdentity(source: string): string {
  return source.replaceAll('\\', '/').replace(/^\.\//, '');
}

/** Shared project discovery policy for filesystem, Git, and editor adapters. */
export function isIgnoredProjectSourceDirectory(name: string): boolean {
  return name.startsWith('.') || ignoredSourceDirectoryNames.has(name);
}

export function isDiscoverableProjectSource(source: string): boolean {
  const normalized = normalizeProjectSourceIdentity(source);
  return isSafeProjectSourceIdentity(normalized)
    && normalized.endsWith('.ai')
    && !normalized.split('/').slice(0, -1).some(isIgnoredProjectSourceDirectory);
}

export function isSafeProjectSourceIdentity(source: string): boolean {
  const normalized = normalizeProjectSourceIdentity(source);
  return normalized.length > 0
    && !normalized.startsWith('/')
    && !normalized.includes('\0')
    && !normalized.split('/').some((part) => part === '..');
}
