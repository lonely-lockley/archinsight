import type { Diagnostic, FileTreeNode } from './api';
import type { BuiltinDiagramView } from '@insight/language';

export type ProjectUiState = {
  sidebarVisible: boolean;
  sidebarWidth: number;
  messagesVisible: boolean;
  messagesHeight: number;
};

export type MessageView = {
  id: string;
  time?: number;
  level: 'INFO' | 'ERROR' | 'WARNING' | 'NOTE';
  source?: string;
  position?: string;
  message: string;
};

export type WorkspaceTab = {
  id: string;
  filePath?: string;
  sourceIdentity: string;
  title: string;
  content: string;
  svg: string;
  dot?: string;
  diagnostics: Diagnostic[];
  local: boolean;
  readOnly?: boolean;
  projectSource?: boolean;
  diagramMode: DiagramMode;
  query: string;
  queryPreset: boolean;
  deploymentEnvironment?: string;
  queryVisible: boolean;
  diagramScale: number;
  diagramFit: boolean;
  viewMode: EditorViewMode;
  editorSplitRatio: number;
  queryPanelHeight: number;
};

export type DiagramMode = 'default' | BuiltinDiagramView;

export type EditorViewMode = 'split' | 'code' | 'diagram';

export type TreeNode = FileTreeNode;

export type SourceLocation = {
  source: string;
  line: number;
  column: number;
};

export type StructureTreeNodeModel = {
  id: string;
  label: string;
  kind: 'type-root' | 'type' | 'operator-root' | 'operator' | 'context' | 'element' | 'import';
  icon: string;
  meta?: string;
  declaration?: SourceLocation;
  children: StructureTreeNodeModel[];
};
