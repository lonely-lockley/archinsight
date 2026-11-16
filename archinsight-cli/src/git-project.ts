import { openGitVersionedRepository, type GitVersionedRepository } from '@archinsight/git';
import type { ProjectSource } from '@insight/language';
import { CliError } from './cli-error.js';

export interface GitProjectRevision {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly revision: string;
  readonly sources: readonly ProjectSource[];
  readonly repository: GitVersionedRepository;
}

export async function readGitProject(input: string, revision: string): Promise<GitProjectRevision> {
  const signal = new AbortController().signal;
  try {
    const repository = await openGitVersionedRepository(input, signal);
    if (repository === undefined) {
      throw new CliError(`Project path is not inside a Git repository: ${input}`, 'GIT');
    }
    return {
      repositoryRoot: repository.repositoryRoot,
      projectRoot: repository.projectRoot,
      revision: await repository.resolveRevision(revision, signal),
      sources: await repository.readProjectAt(revision, signal),
      repository,
    };
  } catch (cause) {
    if (cause instanceof CliError) throw cause;
    throw new CliError(cause instanceof Error ? cause.message : String(cause), 'GIT');
  }
}
