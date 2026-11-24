import path from 'node:path';
import * as vscode from 'vscode';
import type { ProjectSource } from '@insight/language';
import {
  isIgnoredProjectSourceDirectory,
  normalizeProjectSourceIdentity,
} from '@archinsight/contracts';
import type { WorkspaceQuerySource } from './project-view-queries.js';

export async function readWorkspaceSources(root: vscode.Uri): Promise<ProjectSource[]> {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(root, '**/*.ai'),
    '{**/node_modules/**,**/.*/**,**/build/**,**/dist/**}',
  );
  const sources = new Map<string, ProjectSource>();
  for (const uri of files.sort((left, right) => left.fsPath.localeCompare(right.fsPath))) {
    const sourceName = sourceNameForUri(root, uri);
    if (isIgnoredSource(sourceName)) continue;
    sources.set(sourceName, {
      sourceName,
      source: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),
    });
  }
  for (const document of vscode.workspace.textDocuments) {
    if (!isInsightDocument(document) || !isInside(root, document.uri)) continue;
    const sourceName = sourceNameForUri(root, document.uri);
    if (!isIgnoredSource(sourceName)) sources.set(sourceName, { sourceName, source: document.getText() });
  }
  return [...sources.values()];
}

export async function readWorkspaceQuerySources(root: vscode.Uri): Promise<WorkspaceQuerySource[]> {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(root, '**/*.aiq'),
    '{**/node_modules/**,**/.*/**,**/build/**,**/dist/**}',
  );
  const sources = new Map<string, WorkspaceQuerySource>();
  for (const uri of files.sort((left, right) => left.fsPath.localeCompare(right.fsPath))) {
    const sourceName = sourceNameForUri(root, uri);
    if (!sourceName.endsWith('.aiq') || isIgnoredSource(sourceName)) continue;
    sources.set(sourceName, {
      sourceName,
      source: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),
    });
  }
  for (const document of vscode.workspace.textDocuments) {
    if (!isAiqDocument(document) || !isInside(root, document.uri)) continue;
    const sourceName = sourceNameForUri(root, document.uri);
    if (!isIgnoredSource(sourceName)) sources.set(sourceName, { sourceName, source: document.getText() });
  }
  return [...sources.values()];
}

export function sourceUris(
  root: vscode.Uri,
  sources: readonly ProjectSource[],
): ReadonlyMap<string, vscode.Uri> {
  return new Map(sources.map((source) => [source.sourceName, vscode.Uri.joinPath(root, ...source.sourceName.split('/'))]));
}

export function workspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

export function sourceNameForUri(root: vscode.Uri, uri: vscode.Uri): string {
  return normalizeProjectSourceIdentity(path.relative(root.fsPath, uri.fsPath));
}

export function isIgnoredSource(sourceName: string): boolean {
  return sourceName.split('/').slice(0, -1).some(isIgnoredProjectSourceDirectory);
}

export function isInside(root: vscode.Uri, uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false;
  const relative = path.relative(root.fsPath, uri.fsPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isInsightDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'insight' || document.uri.fsPath.endsWith('.ai');
}

export function isAiqDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'archinsight-query' || document.uri.fsPath.endsWith('.aiq');
}
