import { isBuiltinDiagramView } from '@insight/language';
import type { LanguageSnapshot } from '@insight/language';
import type {
  ApiErrorResponse,
  AuthUserResponse,
  FileContentResponse,
  FileOperationResponse,
  FileRenameRequest,
  FileSaveRequest,
  FileTreeNode,
  FileTreeResponse,
  FolderCreateRequest,
  DiagnosticDto,
  DotRenderDto,
  LinkRequest,
  LinkResponse,
  PlaygroundPublication,
  ProjectCreateRequest,
  ProjectListResponse,
  ProjectStructureRequest,
  ProjectStructureResponse,
  ProjectSummaryResponse,
  ProjectUpdateRequest,
  PublishPlaygroundRequest,
  SvgRenderRequest,
  SvgRenderResponse
} from './http-types.js';
import {
  ContractValidationError,
  array,
  boolean,
  nullableString,
  number,
  optionalStringRecord,
  record,
  string,
  stringArray
} from './validation.js';

export type ContractParser<T> = (value: unknown) => T;

export function parseProjectCreateRequest(value: unknown): ProjectCreateRequest {
  const input = record(value, 'project create request');
  return { name: nullableString(input.name, 'name') };
}

export const parseProjectUpdateRequest: ContractParser<ProjectUpdateRequest> = parseProjectCreateRequest;

export function parseFileSaveRequest(value: unknown): FileSaveRequest {
  const input = record(value, 'file save request');
  return {
    content: nullableString(input.content, 'content'),
    level: nullableString(input.level, 'level'),
    projectIdentifier: nullableString(input.projectIdentifier, 'projectIdentifier')
  };
}

export function parseFileRenameRequest(value: unknown): FileRenameRequest {
  const input = record(value, 'file rename request');
  return {
    sourcePath: nullableString(input.sourcePath, 'sourcePath'),
    targetPath: nullableString(input.targetPath, 'targetPath')
  };
}

export function parseFolderCreateRequest(value: unknown): FolderCreateRequest {
  const input = record(value, 'folder create request');
  return { path: nullableString(input.path, 'path') };
}

export function parseProjectStructureRequest(value: unknown): ProjectStructureRequest {
  const input = nullableRecord(value, 'project structure request');
  return input == null ? {} : { overlays: optionalStringRecord(input.overlays, 'overlays') };
}

export function parseLinkRequest(value: unknown): LinkRequest {
  const input = nullableRecord(value, 'link request');
  if (input == null) return {};
  const view = input.view;
  if (view != null && !isBuiltinDiagramView(view)) {
    throw new ContractValidationError('view must be a built-in diagram view');
  }
  return {
    openSourceIdentities: input.openSourceIdentities == null ? input.openSourceIdentities : stringArray(input.openSourceIdentities, 'openSourceIdentities'),
    overlays: optionalStringRecord(input.overlays, 'overlays'),
    query: nullableString(input.query, 'query'),
    view,
    environment: nullableString(input.environment, 'environment')
  };
}

export function parseSvgRenderRequest(value: unknown): SvgRenderRequest {
  const input = nullableRecord(value, 'SVG render request');
  if (input == null || input.renders == null) return {};
  return {
    renders: array(input.renders, 'renders').map((item, index) => {
      const render = record(item, `renders[${index}]`);
      return {
        sourceIdentity: string(render.sourceIdentity, `renders[${index}].sourceIdentity`),
        diagram: string(render.diagram, `renders[${index}].diagram`),
        dot: string(render.dot, `renders[${index}].dot`)
      };
    })
  };
}

export function parsePublishPlaygroundRequest(value: unknown): PublishPlaygroundRequest {
  const input = record(value, 'publish playground request');
  return { projectId: nullableString(input.projectId, 'projectId') };
}

export function parseProjectListResponse(value: unknown): ProjectListResponse {
  const input = record(value, 'project list response');
  return { projects: array(input.projects, 'projects').map(parseProjectSummary) };
}

export function parseProjectSummary(value: unknown): ProjectSummaryResponse {
  const input = record(value, 'project summary');
  return {
    id: string(input.id, 'project.id'),
    name: string(input.name, 'project.name'),
    created: string(input.created, 'project.created'),
    updated: string(input.updated, 'project.updated'),
    fileCount: number(input.fileCount, 'project.fileCount')
  };
}

export function parseFileTreeResponse(value: unknown): FileTreeResponse {
  return { root: parseFileTreeNode(record(value, 'file tree response').root) };
}

export function parseFileContentResponse(value: unknown): FileContentResponse {
  const input = record(value, 'file content response');
  return {
    path: string(input.path, 'file.path'),
    content: string(input.content, 'file.content'),
    readOnly: boolean(input.readOnly, 'file.readOnly'),
    revision: string(input.revision, 'file.revision')
  };
}

export function parseFileOperationResponse(value: unknown): FileOperationResponse {
  const input = record(value, 'file operation response');
  return { path: string(input.path, 'operation.path'), revision: string(input.revision, 'operation.revision') };
}

export function parseProjectStructureResponse(value: unknown): ProjectStructureResponse {
  const input = record(value, 'project structure response');
  if (input.schemaVersion !== 'project-structure.v1') {
    throw new ContractValidationError('project structure schemaVersion must be project-structure.v1');
  }
  array(input.contexts, 'structure.contexts');
  return value as ProjectStructureResponse;
}

export function parseLanguageSnapshotResponse(value: unknown): LanguageSnapshot {
  parseLanguageSnapshot(value);
  return value as LanguageSnapshot;
}

export function parseLinkResponse(value: unknown): LinkResponse {
  const input = record(value, 'link response');
  string(input.revision, 'link.revision');
  const analysis = record(input.analysis, 'link.analysis');
  const modes = ['full', 'cache-hit', 'incremental', 'overlay-incremental', 'overlay-full'];
  if (!modes.includes(string(analysis.mode, 'link.analysis.mode'))) {
    throw new ContractValidationError('link.analysis.mode is invalid');
  }
  number(analysis.relinkedSources, 'link.analysis.relinkedSources');
  parseLanguageSnapshot(input.symbols);
  const model = record(input.linkedModel, 'link.linkedModel');
  array(model.contexts, 'link.linkedModel.contexts');
  array(model.elements, 'link.linkedModel.elements');
  array(model.edges, 'link.linkedModel.edges');
  const graph = record(model.graph, 'link.linkedModel.graph');
  array(graph.nodes, 'link.linkedModel.graph.nodes');
  array(graph.relations, 'link.linkedModel.graph.relations');
  parseDiagnostics(input.diagnostics, 'link.diagnostics');
  parseDotRenders(input.renders, 'link.renders');
  parseProjectStructureResponse(input.structure);
  return value as LinkResponse;
}

export function parseSvgRenderResponse(value: unknown): SvgRenderResponse {
  const input = record(value, 'SVG render response');
  const diagnostics = parseDiagnostics(input.diagnostics, 'SVG diagnostics');
  const svgs = array(input.svgs, 'SVG results').map((item, index) => {
    const svg = record(item, `svgs[${index}]`);
    return {
      sourceIdentity: string(svg.sourceIdentity, `svgs[${index}].sourceIdentity`),
      diagram: string(svg.diagram, `svgs[${index}].diagram`),
      svg: string(svg.svg, `svgs[${index}].svg`)
    };
  });
  return { diagnostics, svgs };
}

export function parseAuthUserResponse(value: unknown): AuthUserResponse {
  const input = record(value, 'auth user response');
  boolean(input.authenticated, 'auth.authenticated');
  if (input.roles != null) stringArray(input.roles, 'auth.roles');
  if (input.capabilities != null) stringArray(input.capabilities, 'auth.capabilities');
  return value as AuthUserResponse;
}

export function parsePlaygroundPublication(value: unknown): PlaygroundPublication {
  const input = record(value, 'playground publication');
  for (const field of ['slot', 'repositoryId', 'ownerId', 'publishedBy', 'publishedAt', 'updatedAt']) {
    string(input[field], `publication.${field}`);
  }
  return value as PlaygroundPublication;
}

export function parseNullablePlaygroundPublication(value: unknown): PlaygroundPublication | null {
  return value == null ? null : parsePlaygroundPublication(value);
}

export function parseApiErrorResponse(value: unknown): ApiErrorResponse {
  const input = record(value, 'API error response');
  return {
    error: string(input.error, 'error'),
    ...(typeof input.code === 'string' ? { code: input.code as ApiErrorResponse['code'] } : {}),
    ...(typeof input.correlationId === 'string' ? { correlationId: input.correlationId } : {})
  };
}

function parseFileTreeNode(value: unknown): FileTreeNode {
  const input = record(value, 'file tree node');
  const type = string(input.type, 'tree node type');
  if (type !== 'directory' && type !== 'file') throw new ContractValidationError('tree node type is invalid');
  return {
    name: string(input.name, 'tree node name'),
    path: string(input.path, 'tree node path'),
    type,
    children: array(input.children, 'tree node children').map(parseFileTreeNode)
  };
}

function parseLanguageSnapshot(value: unknown): void {
  const input = record(value, 'language snapshot');
  string(input.schemaVersion, 'snapshot.schemaVersion');
  array(input.types, 'snapshot.types');
  array(input.constructors, 'snapshot.constructors');
  array(input.operators, 'snapshot.operators');
  array(input.enums, 'snapshot.enums');
}

function parseDiagnostics(value: unknown, label: string): DiagnosticDto[] {
  return array(value, label).map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    const input = record(item, itemLabel);
    return {
      source: string(input.source, `${itemLabel}.source`),
      level: string(input.level, `${itemLabel}.level`),
      code: string(input.code, `${itemLabel}.code`),
      message: string(input.message, `${itemLabel}.message`),
      ...(input.line === undefined ? {} : { line: number(input.line, `${itemLabel}.line`) }),
      ...(input.column === undefined ? {} : { column: number(input.column, `${itemLabel}.column`) }),
      ...(input.endLine === undefined ? {} : { endLine: number(input.endLine, `${itemLabel}.endLine`) }),
      ...(input.endColumn === undefined ? {} : { endColumn: number(input.endColumn, `${itemLabel}.endColumn`) }),
      ...(input.category === undefined ? {} : { category: string(input.category, `${itemLabel}.category`) })
    };
  });
}

function parseDotRenders(value: unknown, label: string): DotRenderDto[] {
  return array(value, label).map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    const input = record(item, itemLabel);
    return {
      sourceIdentity: string(input.sourceIdentity, `${itemLabel}.sourceIdentity`),
      diagram: string(input.diagram, `${itemLabel}.diagram`),
      dot: string(input.dot, `${itemLabel}.dot`)
    };
  });
}

function nullableRecord(value: unknown, label: string): Record<string, unknown> | null {
  return value == null ? null : record(value, label);
}
