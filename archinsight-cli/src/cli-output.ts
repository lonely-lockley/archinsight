import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import archy from "archy";
import { instance } from "@viz-js/viz";
import {
  buildProjectStructure,
  buildTypeHierarchy,
  filterTypeHierarchy,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkProjectResult,
  type ProjectStructureDeclaration,
  type RenderGraph,
  type TypeHierarchyNode,
} from "@insight/language";
import { CliError } from "./cli-error.js";

const hiddenStructureTypes = new Set(["List", "Nothing", "Text"]);

export async function renderSvg(dot: string): Promise<string> {
  const viz = await instance();
  const result = viz.render(dot, { format: "svg", engine: "dot" });
  if (result.status === "failure") {
    throw new CliError(result.errors.map((error) => error.message).filter(Boolean).join("\n") || "Graphviz render failed");
  }
  return result.output;
}

export function projectStructure(result: LinkProjectResult, snapshot: LanguageSnapshot): StructureTree {
  const declarations = buildProjectStructure(result);
  return {
    schemaVersion: "project-structure.v1",
    types: filterTypeHierarchy(buildTypeHierarchy(snapshot), {
      includeLanguageTypes: true,
      includeOperators: true,
      excludeIds: hiddenStructureTypes,
    }).map(cliTypeNode),
    contexts: declarations.contexts.map(cliStructureNode),
  };
}

function cliTypeNode(type: TypeHierarchyNode): TypeStructureNode {
  return {
    id: type.id,
    kind: "type",
    ...(type.extends === undefined ? {} : { extends: type.extends }),
    children: type.children.map(cliTypeNode),
  };
}

function cliStructureNode(node: ProjectStructureDeclaration): StructureNode {
  return {
    id: node.id,
    kind: node.kind,
    type: node.type ?? node.constructor,
    source: node.source,
    line: node.line,
    column: node.column,
    children: node.children.map(cliStructureNode),
  };
}

export function formatStructure(structure: StructureTree): string {
  return `${[
    archy({
      label: "types",
      nodes: structure.types.map(typeArchyNode),
    }),
    archy({
      label: "declarations",
      nodes: structure.contexts.map(structureArchyNode),
    }),
  ].join("\n")}\n`;
}

function typeArchyNode(node: TypeStructureNode): ArchyNode {
  return {
    label: node.extends === undefined ? node.id : `${node.id} extends ${node.extends}`,
    nodes: node.children.map(typeArchyNode),
  };
}

function structureArchyNode(node: StructureNode): ArchyNode {
  return {
    label: structureLabel(node),
    nodes: node.children.map(structureArchyNode),
  };
}

function structureLabel(node: StructureNode): string {
  return `${node.kind} ${node.type} ${node.id} (${node.source}:${node.line}:${node.column})`;
}

export function formatDiagnostics(diagnostics: readonly LanguageDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "OK\t-\t-\t0\t0\tNo diagnostics\n";
  }
  return diagnostics.map((diagnostic) => [
    diagnostic.level ?? "ERROR",
    diagnostic.code,
    diagnostic.sourceName,
    String(diagnostic.line),
    String(diagnostic.column),
    diagnostic.message.replaceAll(/\s+/g, " ").trim(),
  ].join("\t")).join("\n") + "\n";
}

export function linkerFinishedLine(diagnostics: readonly LanguageDiagnostic[]): string {
  const summary = diagnosticSummary(diagnostics);
  return [
    "INFO",
    "LINKER_FINISHED",
    "-",
    "0",
    "0",
    `Linker finished: errors: ${summary.ERROR}, warnings: ${summary.WARNING}, notes: ${summary.NOTE}`,
  ].join("\t") + "\n";
}

export function renderFinishedLine(success: boolean, message: string): string {
  return [
    success ? "INFO" : "ERROR",
    success ? "RENDER_FINISHED" : "RENDER_FAILED",
    "-",
    "0",
    "0",
    success ? "Render finished: diagram rendered successfully" : `Render failed: ${message.replaceAll(/\s+/g, " ").trim()}`,
  ].join("\t") + "\n";
}

export function formatGraph(graph: RenderGraph): string {
  return [
    `context\t${graph.context}`,
    `elements\t${Object.keys(graph.elements).length}`,
    `edges\t${graph.edges.length}`,
    `groups\t${graph.groups.length}`,
    "",
  ].join("\n");
}

export function diagnosticSummary(diagnostics: readonly LanguageDiagnostic[]): Record<string, number> {
  const summary: Record<string, number> = { ERROR: 0, WARNING: 0, NOTE: 0 };
  for (const diagnostic of diagnostics) {
    summary[diagnostic.level ?? "ERROR"] = (summary[diagnostic.level ?? "ERROR"] ?? 0) + 1;
  }
  return summary;
}

export function hasErrors(diagnostics: readonly LanguageDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
}

export function exitWithDiagnostics(diagnostics: readonly LanguageDiagnostic[]): void {
  process.exitCode = hasErrors(diagnostics) ? 1 : 0;
}

export async function writeOutput(file: string | undefined, content: string): Promise<void> {
  if (file === undefined || file === "-") {
    process.stdout.write(content);
    return;
  }
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, content);
}

export interface StructureTree {
  readonly schemaVersion: "project-structure.v1";
  readonly types: readonly TypeStructureNode[];
  readonly contexts: readonly StructureNode[];
}

interface TypeStructureNode {
  readonly id: string;
  readonly kind: "type";
  readonly extends?: string;
  readonly children: readonly TypeStructureNode[];
}

interface StructureNode {
  readonly id: string;
  readonly kind: string;
  readonly type: string;
  readonly source: string;
  readonly line: number;
  readonly column: number;
  readonly children: readonly StructureNode[];
}

interface ArchyNode {
  readonly label: string;
  readonly nodes: ArchyNode[];
}
