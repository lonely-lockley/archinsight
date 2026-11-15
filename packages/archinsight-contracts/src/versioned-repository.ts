import type { DiagramDiff, DiagramDiffOrigin, ProjectSource } from '@insight/language';

export type DiagramDiffRevision = {
  readonly id: string;
  readonly shortId: string;
  readonly actorName: string;
  readonly actorEmail?: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly sourcePath: string;
  readonly current: boolean;
};

export type DiagramDiffRevisionCatalogue = {
  readonly schemaVersion: 'diagram-diff-revisions.v1';
  readonly workspaceIdentity: string;
  readonly source: string;
  readonly currentRevision: string;
  readonly revisions: readonly DiagramDiffRevision[];
};

export type DiagramDiffAttributionRequest = {
  readonly before: string;
  readonly after: string;
  readonly origins: Readonly<Record<string, readonly DiagramDiffOrigin[]>>;
};

export type DiagramDiffBlameCommit = {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail?: string;
  readonly authoredAt: string;
  readonly summary: string;
};

export type DiagramDiffAttribution = {
  readonly side: 'before' | 'after';
  readonly sourceName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly precision: 'exact' | 'declaration';
  readonly commits: readonly DiagramDiffBlameCommit[];
};

export type DiagramDiffAttributionDiagnostic = {
  readonly changeId: string;
  readonly side: 'before' | 'after';
  readonly sourceName: string;
  readonly message: string;
};

export type AttributedDiagramDiff = {
  readonly schemaVersion: 'attributed-diagram-diff.v1';
  readonly revisions: { readonly before: string; readonly after: string };
  readonly diff: DiagramDiff;
  readonly attribution: Readonly<Record<string, readonly DiagramDiffAttribution[]>>;
  readonly diagnostics: readonly DiagramDiffAttributionDiagnostic[];
};

/** Repository capability. Its presence, rather than a client or file check, enables versioned diff. */
export interface VersionedRepository {
  catalogueForPath(path: string, signal: AbortSignal): Promise<DiagramDiffRevisionCatalogue>;
  readProjectAt(revision: string, signal: AbortSignal): Promise<readonly ProjectSource[]>;
  attribute(
    request: DiagramDiffAttributionRequest,
    signal: AbortSignal,
  ): Promise<{
    readonly attribution: Readonly<Record<string, readonly DiagramDiffAttribution[]>>;
    readonly diagnostics: readonly DiagramDiffAttributionDiagnostic[];
  }>;
  validatePair(before: string, after: string, signal: AbortSignal): Promise<void>;
}
