import { execFile, spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  DiagramDiffAttribution,
  DiagramDiffAttributionDiagnostic,
  DiagramDiffAttributionRequest,
  DiagramDiffBlameCommit,
  DiagramDiffRevision,
  DiagramDiffRevisionCatalogue,
  VersionedRepository,
} from '@archinsight/contracts';
import {
  isIgnoredProjectSourceDirectory,
  normalizeProjectSourceIdentity,
} from '@archinsight/contracts';
import type { DiagramDiffOrigin, ProjectSource } from '@insight/language';

const maxBuffer = 32 * 1024 * 1024;
const maxBlameCacheEntries = 64;
const maxBlobsPerBatch = 64;

export class GitRepositoryError extends Error {
  constructor(message: string, readonly code = 'GIT') {
    super(message);
    this.name = 'GitRepositoryError';
  }
}

export type GitVersionedRepositoryOptions = {
  readonly projectPath: string;
  readonly repositoryRoot: string;
  readonly projectRoot: string;
};

export class GitVersionedRepository implements VersionedRepository {
  readonly projectPath: string;
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  private readonly blameCache = new Map<string, Promise<ReadonlyMap<number, DiagramDiffBlameCommit>>>();

  constructor(options: GitVersionedRepositoryOptions) {
    this.projectPath = options.projectPath;
    this.repositoryRoot = options.repositoryRoot;
    this.projectRoot = options.projectRoot;
  }

  async catalogueForPath(source: string, signal: AbortSignal): Promise<DiagramDiffRevisionCatalogue> {
    const repositoryPath = this.repositoryPath(source);
    const head = (await this.git(['rev-parse', '--verify', 'HEAD^{commit}'], signal)).trim();
    const raw = await this.git([
      'log', '--follow', '--date=iso-strict',
      '--format=%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s',
      '--name-status', '--', repositoryPath,
    ], signal);
    const revisions = parseHistory(raw, repositoryPath).map((item) => ({
      ...item,
      sourcePath: this.sourceName(item.sourcePath),
      current: item.id === head,
      ...(item.id === head ? { shortId: 'HEAD' } : {}),
    }));
    if (!revisions.some((item) => item.id === head)) {
      const metadata = await this.commitMetadata(head, signal);
      revisions.unshift({
        ...metadata,
        shortId: 'HEAD',
        sourcePath: source,
        current: true,
      });
    }
    return {
      schemaVersion: 'diagram-diff-revisions.v1',
      workspaceIdentity: this.repositoryRoot,
      source,
      currentRevision: head,
      revisions,
    };
  }

  async readProjectAt(revision: string, signal: AbortSignal): Promise<readonly ProjectSource[]> {
    const commit = await this.resolveRevision(revision, signal);
    const treePrefix = this.projectPath === '' ? [] : [this.projectPath];
    const names = (await this.git(['ls-tree', '-r', '-z', '--name-only', commit, '--', ...treePrefix], signal))
      .split('\0')
      .filter(Boolean)
      .filter((name) => name.endsWith('.ai'))
      .filter((name) => !this.ignoredSource(name));
    const sortedNames = names.sort();
    const contents = await this.readBlobs(commit, sortedNames, signal);
    return sortedNames.map((name, index) => ({
      sourceName: this.sourceName(name),
      source: contents[index]!,
    }));
  }

  async validatePair(before: string, after: string, signal: AbortSignal): Promise<void> {
    const [resolvedBefore, resolvedAfter] = await Promise.all([
      this.resolveRevision(before, signal),
      this.resolveRevision(after, signal),
    ]);
    try {
      await this.git(['merge-base', '--is-ancestor', resolvedBefore, resolvedAfter], signal);
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new GitRepositoryError('Before must be an ancestor of After', 'INVALID_REVISION_ORDER');
    }
  }

  async resolveRevision(revision: string, signal: AbortSignal): Promise<string> {
    const commit = (await this.git(['rev-parse', '--verify', `${revision}^{commit}`], signal)).trim();
    if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new GitRepositoryError(`Invalid Git revision '${revision}'`, 'INVALID_REVISION');
    return commit;
  }

  async attribute(
    request: DiagramDiffAttributionRequest,
    signal: AbortSignal,
  ): Promise<{
    readonly attribution: Readonly<Record<string, readonly DiagramDiffAttribution[]>>;
    readonly diagnostics: readonly DiagramDiffAttributionDiagnostic[];
  }> {
    const [resolvedBefore, resolvedAfter] = await Promise.all([
      this.resolveRevision(request.before, signal),
      this.resolveRevision(request.after, signal),
    ]);
    const attribution: Record<string, DiagramDiffAttribution[]> = Object.fromEntries(
      Object.keys(request.origins).map((changeId) => [changeId, []]),
    );
    const diagnostics: DiagramDiffAttributionDiagnostic[] = [];
    const groups = groupAttributionOrigins(request.origins);
    for (const group of groups) {
      const revision = group.side === 'before' ? resolvedBefore : resolvedAfter;
      const startLine = Math.min(...group.entries.map(({ origin }) => origin.line));
      const endLine = Math.max(...group.entries.map(({ origin }) => Math.max(origin.line, origin.endLine ?? origin.line)));
      let lines: ReadonlyMap<number, DiagramDiffBlameCommit>;
      try {
        lines = await this.blame(revision, group.sourceName, startLine, endLine, signal);
      } catch (cause) {
        for (const { changeId } of group.entries) {
          diagnostics.push({
            changeId,
            side: group.side,
            sourceName: group.sourceName,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
        continue;
      }
      for (const { changeId, origin: item } of group.entries) {
        const originEndLine = Math.max(item.line, item.endLine ?? item.line);
        try {
          const commits = new Map<string, DiagramDiffBlameCommit>();
          for (let line = item.line; line <= originEndLine; line++) {
            const commit = lines.get(line);
            if (commit !== undefined) commits.set(commit.hash, commit);
          }
          attribution[changeId]!.push({
            side: item.side,
            sourceName: item.sourceName,
            startLine: item.line,
            endLine: originEndLine,
            precision: item.precision,
            commits: [...commits.values()].sort((left, right) => left.hash.localeCompare(right.hash)),
          });
          if (item.precision === 'declaration') {
            diagnostics.push({
              changeId,
              side: item.side,
              sourceName: item.sourceName,
              message: 'Exact semantic source range is unavailable; Git blame uses the containing declaration',
            });
          }
        } catch (cause) {
          diagnostics.push({
            changeId,
            side: item.side,
            sourceName: item.sourceName,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    }
    return { attribution, diagnostics };
  }

  private async blame(
    revision: string,
    sourceName: string,
    startLine: number,
    endLine: number,
    signal: AbortSignal,
  ): Promise<ReadonlyMap<number, DiagramDiffBlameCommit>> {
    const repositoryPath = this.repositoryPath(sourceName);
    const key = `${revision}\0${repositoryPath}\0${startLine}\0${endLine}`;
    let pending = this.blameCache.get(key);
    if (pending === undefined) {
      pending = this.git([
        'blame', '--line-porcelain', '-L', `${startLine},${endLine}`, revision, '--', repositoryPath,
      ], signal).then(parseBlameLines);
      this.blameCache.set(key, pending);
      pending.catch(() => this.blameCache.delete(key));
      while (this.blameCache.size > maxBlameCacheEntries) {
        const oldest = this.blameCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.blameCache.delete(oldest);
      }
    }
    return pending;
  }

  private async readBlobs(
    revision: string,
    repositoryPaths: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    if (repositoryPaths.length === 0) return [];
    if (repositoryPaths.some((name) => name.includes('\n') || name.includes('\r'))) {
      throw new GitRepositoryError('Source paths containing line breaks are unsupported', 'INVALID_PATH');
    }
    const contents: string[] = [];
    for (let offset = 0; offset < repositoryPaths.length; offset += maxBlobsPerBatch) {
      const batch = repositoryPaths.slice(offset, offset + maxBlobsPerBatch);
      const input = batch.map((name) => `${revision}:${name}\n`).join('');
      const output = await runGitWithInput(this.repositoryRoot, ['cat-file', '--batch'], input, signal);
      contents.push(...parseBatchBlobs(output, batch));
    }
    return contents;
  }

  private async commitMetadata(revision: string, signal: AbortSignal): Promise<DiagramDiffRevision> {
    const raw = await this.git(['show', '-s', '--date=iso-strict', '--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s', revision], signal);
    const [id, shortId, actorName, actorEmail, createdAt, summary] = raw.trim().split('\x1f');
    if (id === undefined || shortId === undefined || actorName === undefined || createdAt === undefined) {
      throw new GitRepositoryError(`Cannot read metadata for revision '${revision}'`);
    }
    return { id, shortId, actorName, ...(actorEmail ? { actorEmail } : {}), createdAt, summary: summary ?? '', sourcePath: '', current: false };
  }

  private repositoryPath(sourceName: string): string {
    const raw = normalizeProjectSourceIdentity(sourceName);
    const normalized = path.posix.normalize(raw);
    if (raw.includes('\0') || normalized === '.' || path.posix.isAbsolute(normalized)
        || normalized === '..' || normalized.startsWith('../')) {
      throw new GitRepositoryError(`Source path is outside the project: ${sourceName}`, 'INVALID_PATH');
    }
    return this.projectPath === '' ? normalized : `${this.projectPath}/${normalized}`;
  }

  private sourceName(repositoryPath: string): string {
    if (this.projectPath === '') return repositoryPath;
    const prefix = `${this.projectPath}/`;
    return repositoryPath.startsWith(prefix)
      ? repositoryPath.slice(prefix.length)
      : path.posix.relative(this.projectPath, repositoryPath);
  }

  private ignoredSource(repositoryPath: string): boolean {
    const relative = this.sourceName(repositoryPath);
    return relative.split('/').slice(0, -1).some(isIgnoredProjectSourceDirectory);
  }

  private git(args: readonly string[], signal: AbortSignal): Promise<string> {
    return runGit(this.repositoryRoot, args, signal);
  }
}

export async function openGitVersionedRepository(
  input: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<GitVersionedRepository | undefined> {
  const requested = path.resolve(input);
  const resolved = await realpath(requested).catch(() => requested);
  const info = await stat(resolved).catch(() => undefined);
  if (info === undefined) throw new GitRepositoryError(`Project path does not exist: ${input}`, 'NOT_FOUND');
  const projectRoot = info.isDirectory() ? resolved : path.dirname(resolved);
  let repositoryRoot: string;
  try {
    repositoryRoot = (await runGit(projectRoot, ['rev-parse', '--show-toplevel'], signal)).trim();
  } catch {
    return undefined;
  }
  repositoryRoot = await realpath(repositoryRoot).catch(() => repositoryRoot);
  const projectPath = relativePath(repositoryRoot, projectRoot);
  if (projectPath === '..' || projectPath.startsWith('../')) return undefined;
  return new GitVersionedRepository({ projectPath, repositoryRoot, projectRoot });
}

function runGit(cwd: string, args: readonly string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer,
      windowsHide: true,
      signal,
    }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      if (signal.aborted) {
        reject(error);
        return;
      }
      reject(new GitRepositoryError(stderr.trim() || error.message));
    });
  });
}

function runGitWithInput(
  cwd: string,
  args: readonly string[],
  input: string,
  signal: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], {
      windowsHide: true,
      signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const fail = (cause: Error): void => {
      if (settled) return;
      settled = true;
      reject(cause);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxBuffer) {
        child.kill();
        fail(new GitRepositoryError('Git output exceeds the configured limit'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => fail(error));
    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve(Buffer.concat(stdout));
        return;
      }
      fail(new GitRepositoryError(Buffer.concat(stderr).toString('utf8').trim() || `Git exited with code ${code}`));
    });
    child.stdin.end(input);
  });
}

function parseHistory(raw: string, initialPath: string): DiagramDiffRevision[] {
  let currentPath = initialPath;
  const result: DiagramDiffRevision[] = [];
  for (const record of raw.split('\x1e').map((item) => item.trim()).filter(Boolean)) {
    const [metadata = '', ...changes] = record.split('\n');
    const [id, shortId, actorName, actorEmail, createdAt, summary] = metadata.split('\x1f');
    if (!id || !shortId || !actorName || !createdAt) continue;
    result.push({
      id,
      shortId,
      actorName,
      ...(actorEmail ? { actorEmail } : {}),
      createdAt,
      summary: summary ?? '',
      sourcePath: currentPath,
      current: false,
    });
    for (const change of changes) {
      const [status, oldPath, newPath] = change.split('\t');
      if (status?.startsWith('R') && newPath === currentPath && oldPath) currentPath = oldPath;
    }
  }
  return result;
}

function parseBlameLines(raw: string): ReadonlyMap<number, DiagramDiffBlameCommit> {
  const commits = new Map<number, DiagramDiffBlameCommit>();
  let hash: string | undefined;
  let finalLine: number | undefined;
  let authorName = '';
  let authorEmail: string | undefined;
  let authoredAt = '';
  let summary = '';
  for (const line of raw.split('\n')) {
    const header = /^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/.exec(line);
    if (header !== null) {
      hash = header[1];
      finalLine = Number(header[2]);
      authorName = '';
      authorEmail = undefined;
      authoredAt = '';
      summary = '';
      continue;
    }
    if (line.startsWith('author ')) authorName = line.slice(7);
    else if (line.startsWith('author-mail ')) authorEmail = line.slice(12).replace(/^<|>$/g, '');
    else if (line.startsWith('author-time ')) authoredAt = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t') && hash !== undefined && finalLine !== undefined) {
      commits.set(finalLine, { hash, authorName, ...(authorEmail ? { authorEmail } : {}), authoredAt, summary });
    }
  }
  return commits;
}

function groupAttributionOrigins(
  origins: DiagramDiffAttributionRequest['origins'],
): readonly {
  readonly side: 'before' | 'after';
  readonly sourceName: string;
  readonly entries: readonly { readonly changeId: string; readonly origin: DiagramDiffOrigin }[];
}[] {
  const groups = new Map<string, {
    side: 'before' | 'after';
    sourceName: string;
    entries: { changeId: string; origin: DiagramDiffOrigin }[];
  }>();
  for (const [changeId, values] of Object.entries(origins)) {
    for (const origin of uniqueOrigins(values)) {
      const key = `${origin.side}\0${origin.sourceName}`;
      const group = groups.get(key) ?? { side: origin.side, sourceName: origin.sourceName, entries: [] };
      group.entries.push({ changeId, origin });
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.side.localeCompare(right.side) || left.sourceName.localeCompare(right.sourceName)
  );
}

function parseBatchBlobs(output: Buffer, repositoryPaths: readonly string[]): readonly string[] {
  const result: string[] = [];
  let offset = 0;
  for (const repositoryPath of repositoryPaths) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new GitRepositoryError(`Cannot read Git blob header for '${repositoryPath}'`);
    const header = output.subarray(offset, headerEnd).toString('utf8');
    const match = /^[0-9a-f]{40,64} blob (\d+)$/.exec(header);
    if (match === null) throw new GitRepositoryError(`Cannot read '${repositoryPath}' at the selected revision: ${header}`);
    const size = Number(match[1]);
    const start = headerEnd + 1;
    const end = start + size;
    if (!Number.isSafeInteger(size) || end >= output.length) {
      throw new GitRepositoryError(`Invalid Git blob size for '${repositoryPath}'`);
    }
    result.push(output.subarray(start, end).toString('utf8'));
    if (output[end] !== 0x0a) throw new GitRepositoryError(`Invalid Git batch delimiter for '${repositoryPath}'`);
    offset = end + 1;
  }
  return result;
}

function uniqueOrigins(origins: readonly DiagramDiffOrigin[]): readonly DiagramDiffOrigin[] {
  const values = new Map<string, DiagramDiffOrigin>();
  for (const item of origins) {
    const key = `${item.side}\0${item.sourceName}\0${item.line}\0${item.endLine ?? item.line}\0${item.precision}`;
    values.set(key, item);
  }
  return [...values.values()].sort((left, right) =>
    left.side.localeCompare(right.side)
      || left.sourceName.localeCompare(right.sourceName)
      || left.line - right.line
  );
}

function relativePath(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}
