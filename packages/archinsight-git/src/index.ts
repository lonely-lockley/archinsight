import { execFile } from 'node:child_process';
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
import type { DiagramDiffOrigin, ProjectSource } from '@insight/language';

const maxBuffer = 32 * 1024 * 1024;

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
  private readonly blameCache = new Map<string, Promise<readonly DiagramDiffBlameCommit[]>>();

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
    return Promise.all(names.sort().map(async (name) => ({
      sourceName: this.sourceName(name),
      source: await this.git(['show', `${commit}:${name}`], signal),
    })));
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
    const attribution: Record<string, DiagramDiffAttribution[]> = {};
    const diagnostics: DiagramDiffAttributionDiagnostic[] = [];
    for (const [changeId, origins] of Object.entries(request.origins)) {
      const entries: DiagramDiffAttribution[] = [];
      for (const item of uniqueOrigins(origins)) {
        const revision = item.side === 'before' ? resolvedBefore : resolvedAfter;
        const endLine = Math.max(item.line, item.endLine ?? item.line);
        try {
          entries.push({
            side: item.side,
            sourceName: item.sourceName,
            startLine: item.line,
            endLine,
            precision: item.precision,
            commits: await this.blame(revision, item.sourceName, item.line, endLine, signal),
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
      attribution[changeId] = entries;
    }
    return { attribution, diagnostics };
  }

  private async blame(
    revision: string,
    sourceName: string,
    startLine: number,
    endLine: number,
    signal: AbortSignal,
  ): Promise<readonly DiagramDiffBlameCommit[]> {
    const repositoryPath = this.repositoryPath(sourceName);
    const key = `${revision}\0${repositoryPath}\0${startLine}\0${endLine}`;
    let pending = this.blameCache.get(key);
    if (pending === undefined) {
      pending = this.git([
        'blame', '--line-porcelain', '-L', `${startLine},${endLine}`, revision, '--', repositoryPath,
      ], signal).then(parseBlame);
      this.blameCache.set(key, pending);
      pending.catch(() => this.blameCache.delete(key));
    }
    return pending;
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
    const raw = sourceName.replaceAll('\\', '/').replace(/^\.\//, '');
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
    return relative.split('/').slice(0, -1).some((part) =>
      part.startsWith('.') || part === 'node_modules' || part === 'build' || part === 'dist'
    );
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

function parseBlame(raw: string): readonly DiagramDiffBlameCommit[] {
  const commits = new Map<string, DiagramDiffBlameCommit>();
  let hash: string | undefined;
  let authorName = '';
  let authorEmail: string | undefined;
  let authoredAt = '';
  let summary = '';
  for (const line of raw.split('\n')) {
    const header = /^([0-9a-f]{40,64}) \d+ \d+(?: \d+)?$/.exec(line);
    if (header !== null) {
      hash = header[1];
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
    else if (line.startsWith('\t') && hash !== undefined) {
      commits.set(hash, { hash, authorName, ...(authorEmail ? { authorEmail } : {}), authoredAt, summary });
    }
  }
  return [...commits.values()].sort((left, right) => left.hash.localeCompare(right.hash));
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
