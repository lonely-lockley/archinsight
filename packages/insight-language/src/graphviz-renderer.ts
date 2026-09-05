import type {
  LinkedContext,
  LinkedElement,
  LinkProjectResult,
  RenderGraph,
  RenderGraphEdge,
  RenderGraphGroup,
  ResolvedPresentation,
  SourceLocation,
} from "./contracts.js";
import { renderIdentity } from "./render-identity.js";

export function renderGraphviz(result: LinkProjectResult, graph: RenderGraph, theme = "light"): string {
  if (result.diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR")) {
    throw new Error("Cannot render invalid link result");
  }

  const hidden = hiddenElements(result, graph);
  const groups = visibleGroups(graph.groups, hidden);
  const groupByOwner = new Map(groups.map((group) => [group.owner, group]));
  const groupOwnerByChild = new Map<string, string>();
  for (const group of groups) {
    for (const child of group.elements) {
      groupOwnerByChild.set(child, group.owner);
    }
  }
  const clusterEdgeOwners = new Set<string>();
  for (const edge of graph.edges) {
    if (groupByOwner.has(edge.source)) {
      clusterEdgeOwners.add(edge.source);
    }
    if (groupByOwner.has(edge.target)) {
      clusterEdgeOwners.add(edge.target);
    }
  }

  const lines: string[] = [];
  writeHeader(lines, result, graph.context, theme);
  const renderedGroups = new Set<string>();
  const renderedElements = new Set<string>();
  for (const group of groups) {
    if (!groupOwnerByChild.has(group.owner)) {
      writeGroup(lines, result, graph, group, groupByOwner, clusterEdgeOwners, renderedGroups, renderedElements, hidden, theme, "  ");
    }
  }
  for (const element of Object.values(graph.elements)) {
    if (!hidden.has(element.id) && !renderedElements.has(element.id) && !groupOwnerByChild.has(element.id)) {
      writeElement(lines, result, graph, element, theme, "  ");
    }
  }
  lines.push("");
  for (const edge of graph.edges) {
    if (hidden.has(edge.source) || hidden.has(edge.target)) {
      continue;
    }
    writeEdge(lines, result, edge, groupByOwner, theme);
  }
  lines.push("}");
  return lines.join("\n");
}

function writeHeader(lines: string[], result: LinkProjectResult, context: string, theme: string): void {
  const contextPresentation = presentation(result, "Context");
  const elementPresentation = presentation(result, "Element");
  const edgePresentation = presentation(result, "Edge");
  const contextTheme = section(contextPresentation, theme);
  const elementTheme = section(elementPresentation, theme);
  const edgeTheme = section(edgePresentation, theme);
  const contextGraphviz = section(contextPresentation, "graphviz");
  const edgeGraphviz = section(edgePresentation, "graphviz");

  lines.push(`digraph ${quoted(context)} {`);
  lines.push("");
  lines.push(`  labelloc=${unquoted(contextGraphviz.labelloc ?? "t")}`);
  writeGraphBlock(lines, "graph", { bgcolor: contextTheme.fill ?? "#f4f4f4" });
  writeGraphBlock(lines, "node", {
    fontcolor: elementTheme.text ?? "#f4f4f4",
    fontsize: "14px",
    width: "2",
    height: "1",
    color: elementTheme.stroke ?? "#f4f4f4",
  });
  writeGraphBlock(lines, "edge", {
    minlen: edgeGraphviz.minlen ?? "1.5",
    color: edgeTheme.stroke ?? "#4a4a4a",
    fontcolor: edgeTheme.text ?? "#4a4a4a",
    fontsize: edgeGraphviz.fontsize ?? "8px",
    penwidth: edgeGraphviz.penwidth ?? "0.7",
  });
  for (const [name, fallback] of Object.entries({
    overlap: "false",
    concentrate: "false",
    rankdir: "TB",
    newrank: "true",
    compound: "true",
    nodesep: "1",
    ranksep: "1",
    splines: "spline",
  })) {
    lines.push(`  ${name}=${unquoted(contextGraphviz[name] ?? fallback)}`);
  }
  lines.push("");
}

function writeGroup(
  lines: string[],
  result: LinkProjectResult,
  graph: RenderGraph,
  group: RenderGraphGroup,
  groupByOwner: ReadonlyMap<string, RenderGraphGroup>,
  clusterEdgeOwners: ReadonlySet<string>,
  renderedGroups: Set<string>,
  renderedElements: Set<string>,
  hidden: ReadonlySet<string>,
  theme: string,
  indent: string,
): void {
  if (renderedGroups.has(group.owner)) {
    return;
  }
  renderedGroups.add(group.owner);
  const ownerElement = graph.elements[group.owner] ?? findElement(result, group.owner);
  const ownerContext = ownerElement === undefined ? findContext(result, group.owner) : undefined;
  if (ownerElement !== undefined) {
    renderedElements.add(ownerElement.id);
  }

  lines.push(`${indent}subgraph ${quoted(clusterId(group.owner))} {`);
  const contentIndent = `${indent}  `;
  lines.push(`${contentIndent}id=${quoted(clusterId(group.owner))}`);
  const contextTheme = section(presentation(result, "Context"), theme);
  if (ownerElement !== undefined) {
    const ownerPresentation = presentation(result, ownerElement.type);
    lines.push(`${contentIndent}label=${htmlLabel(
      field(ownerPresentation, "header", ownerElement) ?? fallbackName(ownerElement.id),
      field(ownerPresentation, "subtitle", ownerElement),
      field(ownerPresentation, "body", ownerElement),
      undefined,
      ownerElement.constructor,
    )}`);
    lines.push(`${contentIndent}tooltip=${quoted("Go to declaration")}`);
    lines.push(`${contentIndent}URL=${quoted(declarationUrl(ownerElement))}`);
  } else if (ownerContext !== undefined) {
    const ownerPresentation = presentation(result, ownerContext.type);
    lines.push(`${contentIndent}label=${htmlLabel(
      contextField(ownerPresentation, "header", ownerContext) ?? fallbackName(ownerContext.id),
      contextField(ownerPresentation, "subtitle", ownerContext),
      contextField(ownerPresentation, "body", ownerContext),
    )}`);
    lines.push(`${contentIndent}tooltip=${quoted("Go to declaration")}`);
    lines.push(`${contentIndent}URL=${quoted(declarationUrlForLocation(ownerContext.declaration) ?? declarationUrlForSource(ownerContext.sourceIdentity))}`);
  } else if (group.label !== undefined) {
    lines.push(`${contentIndent}label=${htmlLabel(group.label)}`);
  } else {
    lines.push(`${contentIndent}label=""`);
  }
  lines.push(`${contentIndent}margin="50"`);
  lines.push(`${contentIndent}color=${quoted(contextTheme.stroke ?? "#08427B")}`);
  lines.push(`${contentIndent}fontcolor=${quoted(contextTheme.text ?? "#1e1e1e")}`);
  lines.push(`${contentIndent}style="dotted"`);
  lines.push("");
  if (clusterEdgeOwners.has(group.owner)) {
    writeStatement(lines, clusterAnchorId(group.owner), {
      id: clusterAnchorId(group.owner),
      label: "\"\"",
      shape: "point",
      width: "0",
      height: "0",
      style: "invis",
    }, contentIndent);
    lines.push("");
  }
  for (const child of group.elements) {
    const childGroup = groupByOwner.get(child);
    if (childGroup !== undefined) {
      writeGroup(lines, result, graph, childGroup, groupByOwner, clusterEdgeOwners, renderedGroups, renderedElements, hidden, theme, contentIndent);
      continue;
    }
    const element = graph.elements[child];
    if (element !== undefined && !hidden.has(element.id)) {
      renderedElements.add(element.id);
      writeElement(lines, result, graph, element, theme, contentIndent);
    }
  }
  lines.push("");
  lines.push(`${indent}}`);
}

function writeElement(lines: string[], result: LinkProjectResult, graph: RenderGraph, element: LinkedElement, theme: string, indent: string): void {
  const basePresentation = presentation(result, element.type);
  const resolvedPresentation = graph.externalElements.includes(element.id)
    ? externalizedPresentation(basePresentation, theme)
    : basePresentation;
  const properties = dotProperties(resolvedPresentation, theme, false);
  Object.assign(properties, section(resolvedPresentation, "graphviz"));
  applyAnnotations(properties, element.annotations ?? [], false);
  properties.id = nodeDomId(element.id);
  properties.tooltip = "Go to declaration";
  properties.URL = declarationUrl(element);
  properties.label = htmlLabel(
    field(resolvedPresentation, "header", element) ?? fallbackName(element.id),
    field(resolvedPresentation, "subtitle", element),
    field(resolvedPresentation, "body", element),
    undefined,
    element.constructor,
  ) ?? "";
  writeStatement(lines, dotNodeId(element.id), properties, indent);
  if (element.note !== undefined) {
    writeNote(lines, noteId(element.id), dotNodeId(element.id), element.note, noteUrl(element.noteSource, element), indent);
  }
}

function writeEdge(
  lines: string[],
  result: LinkProjectResult,
  edge: RenderGraphEdge,
  groupByOwner: ReadonlyMap<string, RenderGraphGroup>,
  theme: string,
): void {
  const resolvedPresentation = presentation(result, edge.edge.type);
  const properties = dotProperties(resolvedPresentation, theme, true);
  Object.assign(properties, section(resolvedPresentation, "graphviz"));
  applyAnnotations(properties, edge.edge.annotations ?? [], true);
  properties.id = edgeId(edge);
  properties.tooltip = "Go to declaration";
  properties.URL = declarationUrlForLocation(edge.edge.declaration)
    ?? declarationUrlForSource(edge.edge.sourceIdentity);
  const label = htmlLabel(
    edgeField(resolvedPresentation, "header", edge.edge),
    edgeField(resolvedPresentation, "subtitle", edge.edge),
    edgeField(resolvedPresentation, "body", edge.edge),
    edge.edge.note,
  );
  if (label !== undefined) {
    properties.label = label;
  }

  let source = dotNodeId(edge.source);
  if (groupByOwner.has(edge.source)) {
    source = clusterAnchorId(edge.source);
    properties.ltail = clusterId(edge.source);
  }
  let target = dotNodeId(edge.target);
  if (groupByOwner.has(edge.target)) {
    target = clusterAnchorId(edge.target);
    properties.lhead = clusterId(edge.target);
  }
  lines.push(`  ${quoted(source)} -> ${quoted(target)} [${formatProperties(properties)}]`);
}

function writeNote(lines: string[], id: string, targetId: string, note: string, url: string, indent: string): void {
  writeStatement(lines, id, {
    id,
    tooltip: "Go to declaration",
    URL: url,
    label: htmlLabel(undefined, undefined, undefined, wrapTextIfNotFormatted(note)) ?? "",
    shape: "note",
    style: "filled",
    fillcolor: "#faf6a2",
    fontcolor: "#000000",
    color: "#edce07",
  }, indent);
  lines.push(`${indent}${quoted(id)} -> ${quoted(targetId)} [${formatProperties({
    color: "#edce07",
    dir: "none",
    penwidth: "1",
    minlen: "0.2",
    maxlen: "1",
  })}]`);
}

function visibleGroups(groups: readonly RenderGraphGroup[], hidden: ReadonlySet<string>): readonly RenderGraphGroup[] {
  return groups
    .map((group) => ({
      ...group,
      elements: group.elements.filter((element) => !hidden.has(element)),
    }))
    .filter((group) => !hidden.has(group.owner) && group.elements.length > 0);
}

function hiddenElements(result: LinkProjectResult, graph: RenderGraph): ReadonlySet<string> {
  return new Set(Object.values(graph.elements)
    .filter((element) => section(presentation(result, element.type), "graphviz").visible?.toLowerCase() === "false")
    .map((element) => element.id));
}

function dotProperties(presentationDefinition: ResolvedPresentation, theme: string, edge: boolean): Record<string, string> {
  const values = section(presentationDefinition, theme);
  return {
    ...(values.fill === undefined || edge ? {} : { fillcolor: values.fill }),
    ...(values.stroke === undefined ? {} : { color: values.stroke }),
    ...(values.text === undefined ? {} : { fontcolor: values.text }),
  };
}

function presentation(result: LinkProjectResult, type: string): ResolvedPresentation {
  return result.presentations[type] ?? result.presentations.Element ?? {
    name: "Element",
    assignments: {},
    sections: {},
  };
}

function externalizedPresentation(
  base: ResolvedPresentation,
  theme: string,
): ResolvedPresentation {
  const modifier = section(base, theme === "dark" ? "externalDark" : "externalLight");
  return {
    ...base,
    sections: {
      ...base.sections,
      [theme]: { ...section(base, theme), ...modifier },
    },
  };
}

function section(presentationDefinition: ResolvedPresentation, name: string): Readonly<Record<string, string>> {
  return presentationDefinition.sections[name] ?? {};
}

function field(presentationDefinition: ResolvedPresentation, name: string, element: LinkedElement): string | undefined {
  const attribute = presentationDefinition.assignments[name];
  return attribute === undefined ? undefined : element.attributes[attribute]?.[0];
}

function contextField(presentationDefinition: ResolvedPresentation, name: string, context: LinkedContext): string | undefined {
  const attribute = presentationDefinition.assignments[name];
  return attribute === undefined ? undefined : context.attributes[attribute]?.[0];
}

function edgeField(presentationDefinition: ResolvedPresentation, name: string, edge: RenderGraphEdge["edge"]): string | undefined {
  const attribute = presentationDefinition.assignments[name];
  return attribute === undefined ? undefined : edge.attributes[attribute]?.[0];
}

function applyAnnotations(properties: Record<string, string>, annotations: readonly { readonly name: string; readonly value?: string }[], edge: boolean): void {
  if (annotations.some((annotation) => annotation.name === "planned")) {
    properties.fillcolor = "#0e8006";
    if (edge) {
      properties.color = "#0e8006";
    }
  } else if (annotations.some((annotation) => annotation.name === "deprecated")) {
    properties.fillcolor = "#a80808";
    if (edge) {
      properties.color = "#a80808";
    }
  }
  for (const annotation of annotations) {
    if (annotation.name === "attribute") {
      Object.assign(properties, parseAttributeProperties(annotation.value ?? ""));
    }
  }
}

function parseAttributeProperties(value: string): Record<string, string> {
  return Object.fromEntries(value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.includes("="))
    .map((item) => {
      const separator = item.indexOf("=");
      return [item.slice(0, separator).trim(), item.slice(separator + 1).trim()];
    }));
}

function htmlLabel(header?: string, subtitle?: string, body?: string, note?: string, typeLabel?: string): string | undefined {
  if (header === undefined && subtitle === undefined && body === undefined && note === undefined && typeLabel === undefined) {
    return undefined;
  }
  const rows = [
    typeLabelRow(typeLabel),
    labelRow(header, true),
    labelRow(subtitle, false, "point-size=\"10px\"", "[", "]"),
    labelRow(body, false, "point-size=\"10px\""),
    noteRow(note),
  ].filter((row): row is string => row !== undefined).join("");
  return `<<table border="0">${rows}</table>>`;
}

function typeLabelRow(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return `<tr><td><font point-size="9px">{${formattedText(value)}}</font></td></tr>`;
}

function labelRow(value: string | undefined, bold: boolean, fontStyle?: string, open = "", close = ""): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = `${open}${open === "" ? "" : " "}${formattedText(value)}${close === "" ? "" : " "}${close}`;
  const styled = fontStyle === undefined ? text : `<font ${fontStyle}>${text}</font>`;
  return `<tr><td>${bold ? `<b>${styled}</b>` : styled}</td></tr>`;
}

function noteRow(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return `<tr><td><table border="0" cellborder="1" cellspacing="0" cellpadding="8" color="#edce07"><tr><td bgcolor="#faf6a2" width="120" height="44"><font color="#000000" point-size="10px">${formattedText(value)}</font></td></tr></table></td></tr>`;
}

function wrapTextIfNotFormatted(value: string): string {
  if (value.includes("\n")) {
    return value;
  }
  const maxLineLength = 50;
  const words = value.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return value;
  }
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if (line.length + 1 + word.length <= maxLineLength) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

function formattedText(value: string): string {
  return escapeHtml(wrapTextIfNotFormatted(value)).replace(/\n/g, "<br/>");
}

function writeGraphBlock(lines: string[], name: string, properties: Record<string, string>): void {
  lines.push(`  ${name} [${formatProperties(properties)}]`);
}

function writeStatement(lines: string[], id: string, properties: Record<string, string>, indent: string): void {
  lines.push(`${indent}${quoted(id)} [${formatProperties(properties)}]`);
}

function formatProperties(properties: Record<string, string>): string {
  return Object.entries(properties)
    .map(([name, value]) => `${name}=${name === "label" && value.startsWith("<") ? value : quoted(value)}`)
    .join(",");
}

function edgeId(edge: RenderGraphEdge): string {
  return renderIdentity("edge", [
    edge.edge.id,
    edge.source,
    edge.target,
    edge.edge.originSource ?? edge.edge.source,
    edge.edge.originTarget ?? edge.edge.target,
    edge.edge.operator,
    edge.derived,
    edge.projected,
  ]);
}

function clusterId(owner: string): string {
  return `cluster_${renderIdentity("cluster", [owner])}`;
}

function clusterAnchorId(owner: string): string {
  return renderIdentity("cluster-anchor", [owner]);
}

function noteId(id: string): string {
  return renderIdentity("note", [id]);
}

function dotNodeId(id: string): string {
  return id;
}

function nodeDomId(id: string): string {
  return renderIdentity("node", [id]);
}

function fallbackName(id: string): string {
  return id.split("/").at(-1) ?? id;
}

function findElement(result: LinkProjectResult, id: string): LinkedElement | undefined {
  return result.elements.find((element) => element.id === id);
}

function findContext(result: LinkProjectResult, id: string): LinkedContext | undefined {
  return result.contexts.find((context) => context.id === id);
}

function declarationUrl(element: LinkedElement): string {
  return declarationUrlForLocation(element.declaration)
    ?? declarationUrlForSource(element.sourceIdentity);
}

function noteUrl(location: SourceLocation | undefined, element: LinkedElement): string {
  return declarationUrlForLocation(location) ?? declarationUrl(element);
}

function declarationUrlForSource(source: string): string {
  return `insight://goto?source=${encodeURIComponent(source)}`;
}

function declarationUrlForLocation(location: SourceLocation | undefined): string | undefined {
  if (location === undefined) {
    return undefined;
  }
  return `insight://goto?source=${encodeURIComponent(location.sourceName)}&line=${location.line}&column=${location.column}`;
}

function quoted(value: string): string {
  return `"${unquoted(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function unquoted(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("\"") && trimmed.endsWith("\"") ? trimmed.slice(1, -1) : trimmed;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
