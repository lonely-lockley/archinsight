import { describe, expect, it, vi } from 'vitest';
import {
  baseName,
  defaultDialogFileName,
  displayFileName,
  displayFilePath,
  displayNodePath,
  isInsideDirectory,
  joinPath,
  normalizeDialogName,
  parentDirectory,
  replaceDirectoryPrefix,
  stripInsightExtension,
  validateNodeName,
  validateTargetPath
} from './repository-paths';

describe('repository path model', () => {
  it('recognizes descendants without confusing sibling prefixes', () => {
    expect(isInsideDirectory('src/domain/main.ai', 'src')).toBe(true);
    expect(isInsideDirectory('src2/main.ai', 'src')).toBe(false);
    expect(isInsideDirectory('src', 'src')).toBe(false);
  });

  it('retargets a descendant path while preserving its suffix', () => {
    expect(replaceDirectoryPrefix('src/domain/main.ai', 'src', 'architecture')).toBe(
      'architecture/domain/main.ai'
    );
  });

  it('validates file and folder names', () => {
    expect(validateNodeName('', 'file')).toBe('File name is required');
    expect(validateNodeName('', 'folder')).toBe('Folder name is required');
    expect(validateNodeName('nested/main', 'file')).toBe('File name must not contain directories');
    expect(validateNodeName('nested\\main', 'folder')).toBe('Folder name must not contain directories');
    expect(validateNodeName('domain.ai', 'folder')).toBe('Folder name must not use .ai extension');
    expect(validateNodeName('domain.ai', 'file')).toBeUndefined();
  });

  it('rejects paths escaping the repository, oversized paths, and recursive folder moves', () => {
    const missing = vi.fn(() => false);

    expect(validateTargetPath('/main', 'file', undefined, missing)).toBe(
      'File path must stay inside repository'
    );
    expect(validateTargetPath('../main', 'file', undefined, missing)).toBe(
      'File path must stay inside repository'
    );
    expect(validateTargetPath(`a${'b'.repeat(100)}`, 'file', undefined, missing)).toBe(
      'File path is longer than 100 characters'
    );
    expect(validateTargetPath('src/nested', 'folder', 'src', missing)).toBe(
      'Folder cannot be moved inside itself'
    );
  });

  it('permits the current display path but rejects collisions at a new path', () => {
    const exists = vi.fn((path: string) => path === 'src/main');

    expect(validateTargetPath('src/main', 'file', 'src/main.ai', exists)).toBeUndefined();
    expect(validateTargetPath('src/main', 'file', 'src/other.ai', exists)).toBe(
      'Repository item already exists: src/main'
    );
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('normalizes dialog names without applying file extensions to folders', () => {
    expect(normalizeDialogName(' /main.ai/ ', 'file')).toBe('main');
    expect(normalizeDialogName(' /domain.ai/ ', 'folder')).toBe('domain.ai');
    expect(defaultDialogFileName('Untitled 3', 'untitled')).toBe('untitled');
    expect(defaultDialogFileName(' src/main.ai ', 'untitled')).toBe('main');
  });

  it('preserves the existing display and join path contracts', () => {
    expect(stripInsightExtension('main.ai')).toBe('main');
    expect(stripInsightExtension('main.txt')).toBe('main.txt');
    expect(baseName('/src/main.ai/')).toBe('main.ai');
    expect(parentDirectory('/src/domain/main.ai')).toBe('src/domain');
    expect(joinPath('/src/', '/main')).toBe('src/main');
    expect(joinPath('', 'main')).toBe('main');
    expect(displayFileName('src/main.ai')).toBe('main');
    expect(displayFilePath('src/main.ai')).toBe('src/main');
    expect(displayFilePath('')).toBe('');
    expect(displayNodePath('src/domain', 'folder')).toBe('src/domain');
    expect(displayNodePath('src/main.ai', 'file')).toBe('src/main');
  });
});
