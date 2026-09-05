import type {
  LanguageDiagnostic,
  PresentationDefinition,
  ResolvedPresentation,
  SourceLocation,
} from "./contracts.js";
import type { TypeSystem } from "./type-system.js";

const PRESENTATION_FIELDS = new Set(["header", "subtitle", "body"]);
const PRESENTATION_SECTIONS = new Set(["light", "dark", "externalLight", "externalDark", "graphviz"]);
const PRESENTATION_SECTION_PROPERTIES = new Set([
  "fill", "stroke", "text", "bgcolor", "shape", "style", "width",
  "height", "rankdir", "overlap", "newrank", "nodesep", "ranksep",
  "splines", "labelloc", "minlen", "fontsize", "penwidth", "visible",
]);

export type PresentationTextField = "header" | "subtitle" | "body";

export function presentationText(
  presentation: ResolvedPresentation,
  field: PresentationTextField,
  attributes: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  const attribute = presentation.assignments[field];
  return attribute === undefined ? undefined : attributes[attribute]?.[0];
}

export function buildPresentationIndex(
  presentations: readonly PresentationDefinition[],
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): Readonly<Record<string, ResolvedPresentation>> {
  const byName = new Map(presentations.map((presentation) => [presentation.name, presentation]));
  for (const presentation of presentations) {
    validatePresentationDefinition(presentation, typeSystem, diagnostics);
  }
  const resolved = new Map<string, ResolvedPresentation>();
  for (const name of byName.keys()) {
    resolvePresentation(name, byName, typeSystem, resolved, new Set(), diagnostics);
  }
  for (const name of typeSystem.declaredTypes()) {
    resolvePresentation(name, byName, typeSystem, resolved, new Set(), diagnostics);
  }
  return Object.fromEntries(resolved);
}

function validatePresentationDefinition(
  presentation: PresentationDefinition,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): void {
  if (!typeSystem.isDeclared(presentation.name)) {
    diagnostics.push({
      code: "UNKNOWN_PRESENTATION_TYPE",
      message: `Presentation target type '${presentation.name}' is not declared`,
      ...presentationDiagnosticLocation(presentation.source),
    });
    return;
  }
  const attributes = typeSystem.attributes(presentation.name);
  for (const [field, value] of Object.entries(presentation.assignments ?? {})) {
    if (!PRESENTATION_FIELDS.has(field)) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Presentation field '${field}' is not declared`,
        ...presentationDiagnosticLocation(presentation.assignmentPositions?.[field], presentation.source),
      });
      continue;
    }
    if (attributes.size > 0 && !attributes.has(value) && !attributeExistsOnDescendant(typeSystem, presentation.name, value)) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Attribute '${value}' is not declared on type '${presentation.name}'`,
        ...presentationDiagnosticLocation(presentation.assignmentValuePositions?.[field], presentation.assignmentPositions?.[field], presentation.source),
      });
    }
  }
  for (const [section, assignments] of Object.entries(presentation.sections ?? {})) {
    if (!PRESENTATION_SECTIONS.has(section)) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Presentation section '${section}' is not declared`,
        ...presentationDiagnosticLocation(presentation.sectionPositions?.[section], presentation.source),
      });
      continue;
    }
    for (const property of Object.keys(assignments)) {
      if (!PRESENTATION_SECTION_PROPERTIES.has(property)) {
        diagnostics.push({
          code: "ATTRIBUTE_NOT_DECLARED",
          message: `Presentation section property '${property}' is not declared`,
          ...presentationDiagnosticLocation(presentation.sectionPropertyPositions?.[section]?.[property], presentation.sectionPositions?.[section], presentation.source),
        });
      }
    }
  }
}

function presentationDiagnosticLocation(
  ...locations: Array<SourceLocation | undefined>
): Pick<LanguageDiagnostic, "sourceName" | "line" | "column" | "endLine" | "endColumn"> {
  return locations.find((location) => location !== undefined) ?? {
    sourceName: "presentation",
    line: 1,
    column: 1,
  };
}

function attributeExistsOnDescendant(typeSystem: TypeSystem, type: string, attribute: string): boolean {
  for (const candidate of typeSystem.declaredTypes()) {
    if (candidate !== type
      && typeSystem.baseTypes(candidate).includes(type)
      && typeSystem.attribute(candidate, attribute) !== undefined) {
      return true;
    }
  }
  return false;
}

function resolvePresentation(
  name: string,
  presentations: ReadonlyMap<string, PresentationDefinition>,
  typeSystem: TypeSystem,
  resolved: Map<string, ResolvedPresentation>,
  visiting: Set<string>,
  diagnostics: LanguageDiagnostic[],
): ResolvedPresentation | undefined {
  const existing = resolved.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const declaration = presentations.get(name);
  const baseName = inferPresentationBase(name, presentations, typeSystem);
  if (declaration === undefined && baseName === undefined) {
    return undefined;
  }
  if (visiting.has(name)) {
    diagnostics.push({
      code: "CYCLIC_PRESENTATION_INHERITANCE",
      message: `Presentation inheritance for '${name}' contains a cycle`,
      sourceName: "presentation",
      line: 1,
      column: 1,
    });
    return undefined;
  }
  visiting.add(name);
  const base = baseName === undefined
    ? undefined
    : resolvePresentation(baseName, presentations, typeSystem, resolved, visiting, diagnostics);
  visiting.delete(name);
  const item: ResolvedPresentation = {
    name,
    ...(baseName === undefined ? {} : { basePresentation: baseName }),
    assignments: { ...(base?.assignments ?? {}), ...(declaration?.assignments ?? {}) },
    sections: mergeSections(base?.sections ?? {}, declaration?.sections ?? {}),
  };
  resolved.set(name, item);
  return item;
}

function inferPresentationBase(
  name: string,
  presentations: ReadonlyMap<string, PresentationDefinition>,
  typeSystem: TypeSystem,
): string | undefined {
  return typeSystem.baseTypes(name).find((candidate) => presentations.has(candidate));
}

function mergeSections(
  base: Readonly<Record<string, Readonly<Record<string, string>>>>,
  own: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  const result: Record<string, Readonly<Record<string, string>>> = { ...base };
  for (const [section, assignments] of Object.entries(own)) {
    result[section] = { ...(result[section] ?? {}), ...assignments };
  }
  return result;
}
