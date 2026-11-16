import archy from "archy";
import { instance } from "@viz-js/viz";
import { Resvg } from "@resvg/resvg-js";
import { normalizeGraphvizSvgResult } from "@archinsight/graphviz";
import {
  buildProjectStructure,
  buildTypeHierarchy,
  filterTypeHierarchy,
  formatQueryTableCsv,
  formatQueryTableText,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkProjectResult,
  type ProjectStructureDeclaration,
  type RenderGraph,
  type TypeHierarchyNode,
} from "@insight/language";
import { CliError } from "./cli-error.js";
import { writeArtifact } from "./artifact-writer.js";

const hiddenStructureTypes = new Set(["List", "Nothing", "Text"]);

export async function renderSvg(dot: string): Promise<string> {
  const viz = await instance();
  const result = normalizeGraphvizSvgResult(viz.render(dot, { format: "svg", engine: "dot" }));
  if (result.status === "failure") {
    throw new CliError(result.error);
  }
  return result.svg;
}

export function renderPng(svg: string): Uint8Array {
  const dimensions = svgDimensions(svg);
  validatePngDimensions(dimensions.width, dimensions.height);
  const image = new Resvg(svg, {
    dpi: 96,
    font: { loadSystemFonts: false, defaultFontFamily: "sans-serif" },
  }).render();
  validatePngDimensions(image.width, image.height);
  const png = image.asPng();
  if (png.byteLength > 64 * 1024 * 1024) throw new CliError(`PNG output is too large: ${png.byteLength} bytes`);
  return png;
}

function svgDimensions(svg: string): { readonly width: number; readonly height: number } {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0];
  const width = svgLengthToPixels(root === undefined ? undefined : /\bwidth="([^"]+)"/i.exec(root)?.[1]);
  const height = svgLengthToPixels(root === undefined ? undefined : /\bheight="([^"]+)"/i.exec(root)?.[1]);
  if (width === undefined || height === undefined) throw new CliError("SVG dimensions are unavailable for PNG export");
  return { width, height };
}

function svgLengthToPixels(value: string | undefined): number | undefined {
  const match = value === undefined ? undefined : /^\s*([0-9.]+)\s*(px|pt|in|cm|mm)?\s*$/i.exec(value);
  if (match === undefined || match === null) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "pt": return amount * 96 / 72;
    case "in": return amount * 96;
    case "cm": return amount * 96 / 2.54;
    case "mm": return amount * 96 / 25.4;
    default: return amount;
  }
}

function validatePngDimensions(width: number, height: number): void {
  const pixels = Math.ceil(width) * Math.ceil(height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
      || width > 8192 || height > 8192 || !Number.isSafeInteger(pixels) || pixels > 16_777_216) {
    throw new CliError(`Diagram is too large to rasterize: ${Math.ceil(width)} × ${Math.ceil(height)}`);
  }
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
  const summary = [
    `context\t${graph.context}`,
    `elements\t${Object.keys(graph.elements).length}`,
    `edges\t${graph.edges.length}`,
    `groups\t${graph.groups.length}`,
  ];
  const elements = Object.keys(graph.elements).sort().map((id) => {
    const element = graph.elements[id]!;
    const title = element.attributes.name?.[0] ?? element.attributes.title?.[0] ?? "-";
    return `element\t${textField(id)}\t${textField(element.type)}\t${textField(title)}`;
  });
  const edges = graph.edges.map((edge) => {
    const technology = edge.edge.attributes.technology?.join(", ") ?? "-";
    return `edge\t${textField(edge.source)} ${textField(edge.edge.operator)} ${textField(edge.target)}\t${textField(technology)}`;
  });
  const groups = graph.groups.map((group) =>
    `group\t${textField(group.owner)}\t${group.elements.map(textField).join(", ")}`
  );
  return [...summary, ...elements, ...edges, ...groups, ""].join("\n");
}

function textField(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export { formatQueryTableCsv, formatQueryTableText };

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
  await writeArtifact(file, content);
}

export async function writeBinaryOutput(file: string | undefined, content: Uint8Array): Promise<void> {
  await writeArtifact(file, content);
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
