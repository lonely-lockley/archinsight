import type {
  BuiltinDiagramView,
  GraphNode,
  GraphRelation,
  LanguageSnapshot,
  LinkProjectResult,
  ProjectStructure,
  ProjectStructureDeclaration
} from '@insight/language';

export type DiagnosticDto = {
  source: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  level: 'ERROR' | 'WARNING' | 'NOTE' | string;
  code: string;
  message: string;
  category?: 'SOURCE' | 'SYSTEM' | string;
};

export type DotRenderDto = {
  sourceIdentity: string;
  diagram: string;
  dot: string;
};

export type LinkRequest = {
  openSourceIdentities?: string[] | null;
  overlays?: Record<string, string> | null;
  query?: string | null;
  view?: BuiltinDiagramView | null;
  environment?: string | null;
};

export type LinkResponse = {
  revision: string;
  analysis: {
    mode: 'full' | 'cache-hit' | 'incremental' | 'overlay-incremental' | 'overlay-full';
    relinkedSources: number;
  };
  symbols: LanguageSnapshot;
  linkedModel: Omit<LinkProjectResult, 'graph'> & {
    graph: {
      nodes: readonly GraphNode[];
      relations: readonly GraphRelation[];
    };
  };
  diagnostics: DiagnosticDto[];
  renders: DotRenderDto[];
  structure: ProjectStructureResponse;
};

export type SvgRenderRequest = {
  renders?: DotRenderDto[] | null;
};

export type SvgRenderDto = {
  sourceIdentity: string;
  diagram: string;
  svg: string;
};

export type SvgRenderResponse = {
  diagnostics: DiagnosticDto[];
  svgs: SvgRenderDto[];
};

export type ProjectStructureRequest = {
  overlays?: Record<string, string> | null;
};

export type StructureDeclarationDto = ProjectStructureDeclaration;

export type ProjectStructureResponse = ProjectStructure;
