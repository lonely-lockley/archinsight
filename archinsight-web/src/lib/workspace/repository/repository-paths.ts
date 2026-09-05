export type RepositoryDialogTarget = 'file' | 'folder';

export function isInsideDirectory(path: string, directory: string): boolean {
  return path.startsWith(`${directory}/`);
}

export function replaceDirectoryPrefix(
  path: string,
  sourceDirectory: string,
  targetDirectory: string
): string {
  return `${targetDirectory}${path.slice(sourceDirectory.length)}`;
}

export function validateNodeName(
  name: string,
  target: RepositoryDialogTarget
): string | undefined {
  const label = target === 'folder' ? 'Folder' : 'File';
  if (name.length === 0) {
    return `${label} name is required`;
  }
  if (name.includes('/') || name.includes('\\')) {
    return `${label} name must not contain directories`;
  }
  if (target === 'folder' && name.endsWith('.ai')) {
    return 'Folder name must not use .ai extension';
  }
  return undefined;
}

export function validateTargetPath(
  path: string,
  target: RepositoryDialogTarget,
  sourcePath: string | undefined,
  pathExists: (path: string) => boolean
): string | undefined {
  const label = target === 'folder' ? 'Folder' : 'File';
  if (path.length === 0) {
    return `${label} name is required`;
  }
  if (path.startsWith('/') || path.includes('../') || path === '..' || path.startsWith('..')) {
    return `${label} path must stay inside repository`;
  }
  if (path.length > 100) {
    return `${label} path is longer than 100 characters`;
  }
  if (target === 'folder' && sourcePath !== undefined && path.startsWith(`${sourcePath}/`)) {
    return 'Folder cannot be moved inside itself';
  }
  if (displayNodePath(sourcePath ?? '', target) !== path && pathExists(path)) {
    return `Repository item already exists: ${path}`;
  }
  return undefined;
}

export function defaultDialogFileName(title: string, fallback: string): string {
  const value = title.trim();
  if (value.length === 0 || /^Untitled \d+$/.test(value)) {
    return fallback;
  }
  return displayFileName(value);
}

export function normalizeDialogName(name: string, target: RepositoryDialogTarget): string {
  const normalized = name.trim().replace(/^\/+|\/+$/g, '');
  return target === 'file' ? stripInsightExtension(normalized) : normalized;
}

export function displayFileName(path: string): string {
  return stripInsightExtension(baseName(path));
}

export function displayFilePath(path: string): string {
  if (path.length === 0) {
    return '';
  }
  return joinPath(parentDirectory(path), displayFileName(path));
}

export function displayNodePath(path: string, target: RepositoryDialogTarget): string {
  return target === 'folder' ? path : displayFilePath(path);
}

export function stripInsightExtension(value: string): string {
  return value.endsWith('.ai') ? value.slice(0, -3) : value;
}

export function baseName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}

export function parentDirectory(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function joinPath(directory: string, fileName: string): string {
  const cleanDirectory = directory.trim().replace(/^\/+|\/+$/g, '');
  const cleanFileName = fileName.trim().replace(/^\/+|\/+$/g, '');
  return cleanDirectory.length === 0 ? cleanFileName : `${cleanDirectory}/${cleanFileName}`;
}

