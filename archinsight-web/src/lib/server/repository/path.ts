import { invalidRequest } from '$lib/server/errors/application-error';

const SOURCE_FILE_EXTENSION = '.ai';

export function normalizeFileName(path: string | null | undefined): string {
  const normalized = normalizePath(path, 'file');
  return normalized.endsWith(SOURCE_FILE_EXTENSION) ? normalized : `${normalized}${SOURCE_FILE_EXTENSION}`;
}

export function normalizeDirectoryPath(path: string | null | undefined): string {
  const normalized = normalizePath(path, 'folder');
  if (normalized.endsWith(SOURCE_FILE_EXTENSION)) {
    throw invalidRequest(`Repository folder path must not use source file extension: ${path ?? ''}`);
  }
  return normalized;
}

export function parentDirectory(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

export function baseName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

export function childPath(parentPath: string, childName: string): string {
  return parentPath === '' ? childName : `${parentPath}/${childName}`;
}

export function normalizeSourceIdentity(sourceIdentity: string): string {
  return normalizePath(sourceIdentity, 'source identity');
}

function normalizePath(path: string | null | undefined, label: string): string {
  const raw = path ?? '';
  if (raw.startsWith('/')) {
    throw invalidRequest(`Repository ${label} path must be relative: ${raw}`);
  }
  if (raw.includes('//')) {
    throw invalidRequest(`Repository ${label} path contains an empty segment: ${raw}`);
  }
  const normalized = normalizeSegments(raw);
  if (normalized === '' || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw invalidRequest(`Repository ${label} path is outside project scope: ${raw}`);
  }
  if (normalized.length > 100) {
    throw invalidRequest(`Repository ${label} path is longer than 100 characters: ${normalized}`);
  }
  return normalized;
}

function normalizeSegments(path: string): string {
  const output: string[] = [];
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (output.length === 0) {
        return `../${path}`;
      }
      output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join('/');
}
