import type {
  LanguageSnapshot,
  LinkedElement,
  LinkedImport,
  LinkProjectResult,
  SourceLocation,
  TypeDefinition,
} from "./contracts.js";
import { coreLanguageSnapshot } from "./core-snapshot.js";

export interface ProjectStructureLocation {
  readonly source: string;
  readonly line: number;
  readonly column: number;
}

export interface ProjectStructureDeclaration extends ProjectStructureLocation {
  readonly id: string;
  readonly kind: "context" | "element" | "import";
  readonly constructor: string;
  readonly type?: string;
  readonly synthetic?: boolean;
  readonly children: readonly ProjectStructureDeclaration[];
}

export interface ProjectStructure {
  readonly schemaVersion: "project-structure.v1";
  readonly contexts: readonly ProjectStructureDeclaration[];
}

export interface TypeHierarchyNode {
  readonly id: string;
  readonly kind: "type";
  readonly extends?: string;
  readonly origin: "language" | "project";
  readonly operator: boolean;
  readonly declaration?: ProjectStructureLocation;
  readonly children: readonly TypeHierarchyNode[];
}

export interface TypeHierarchyVisibility {
  readonly includeLanguageTypes: boolean;
  readonly includeOperators: boolean;
  readonly excludeIds?: ReadonlySet<string>;
}

export function buildProjectStructure(result: LinkProjectResult): ProjectStructure {
  const childrenByParent = new Map<string, LinkedElement[]>();
  for (const element of result.elements) {
    if (element.anonymous || element.parent === undefined) {
      continue;
    }
    const children = childrenByParent.get(element.parent) ?? [];
    children.push(element);
    childrenByParent.set(element.parent, children);
  }

  const importsBySource = new Map<string, LinkedImport[]>();
  for (const item of result.imports) {
    const imports = importsBySource.get(item.sourceIdentity) ?? [];
    imports.push(item);
    importsBySource.set(item.sourceIdentity, imports);
  }
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));

  return {
    schemaVersion: "project-structure.v1",
    contexts: result.contexts.map((context) => ({
      id: context.id,
      kind: "context",
      constructor: context.type,
      type: context.type,
      ...structureLocation(context.declaration, context.sourceIdentity),
      ...(context.synthetic === true ? { synthetic: true } : {}),
      children: [
        ...(importsBySource.get(context.sourceIdentity) ?? [])
          .map((item) => importDeclaration(item, elementsById)),
        ...elementDeclarations(
          result.elements.filter((element) =>
            element.context === context.id && element.parent === undefined && !element.anonymous
          ),
          childrenByParent,
        ),
      ],
    })),
  };
}

export function filterProjectStructure(
  structure: ProjectStructure,
  options: { readonly includeSyntheticContexts: boolean },
): ProjectStructure {
  return {
    ...structure,
    contexts: options.includeSyntheticContexts
      ? structure.contexts
      : structure.contexts.filter((context) => context.synthetic !== true),
  };
}

export function buildTypeHierarchy(snapshot: LanguageSnapshot): readonly TypeHierarchyNode[] {
  const languageTypeNames = new Set(coreLanguageSnapshot.types.map((type) => type.name));
  const typesByName = new Map(snapshot.types.map((type) => [type.name, type]));
  const operatorTypes = new Set(snapshot.operators.map((operator) => operator.ownerType));
  return hierarchyFromNodes(snapshot.types.map((type) => ({
    id: type.name,
    kind: "type" as const,
    ...(type.baseType === undefined ? {} : { extends: type.baseType }),
    origin: languageTypeNames.has(type.name) ? "language" as const : "project" as const,
    operator: isOperatorType(type, typesByName, operatorTypes),
    ...(type.declaration === undefined ? {} : { declaration: structureLocation(type.declaration, type.declaration.sourceName) }),
    children: [],
  })));
}

export function filterTypeHierarchy(
  hierarchy: readonly TypeHierarchyNode[],
  visibility: TypeHierarchyVisibility,
): readonly TypeHierarchyNode[] {
  const visible = flattenTypeHierarchy(hierarchy).filter((type) => {
    if (visibility.excludeIds?.has(type.id) === true) {
      return false;
    }
    if (type.origin === "project") {
      return true;
    }
    return type.operator ? visibility.includeOperators : visibility.includeLanguageTypes;
  });
  return hierarchyFromNodes(visible);
}

function elementDeclarations(
  elements: readonly LinkedElement[],
  childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>,
): readonly ProjectStructureDeclaration[] {
  return elements.map((element) => ({
    id: element.localId,
    kind: "element",
    constructor: element.constructor,
    type: element.type,
    ...structureLocation(element.declaration, element.sourceIdentity),
    ...(element.synthetic === true ? { synthetic: true } : {}),
    children: elementDeclarations(childrenByParent.get(element.id) ?? [], childrenByParent),
  }));
}

function importDeclaration(
  item: LinkedImport,
  elementsById: ReadonlyMap<string, LinkedElement>,
): ProjectStructureDeclaration {
  const imported = elementsById.get(item.target);
  return {
    id: item.alias,
    kind: "import",
    constructor: "import",
    ...(imported?.type === undefined ? {} : { type: imported.type }),
    ...structureLocation(item.declaration, item.sourceIdentity),
    children: [],
  };
}

function structureLocation(declaration: SourceLocation | undefined, fallbackSource: string): ProjectStructureLocation {
  return {
    source: declaration?.sourceName ?? fallbackSource,
    line: declaration?.line ?? 1,
    column: declaration?.column ?? 1,
  };
}

function isOperatorType(
  type: TypeDefinition,
  typesByName: ReadonlyMap<string, TypeDefinition>,
  operatorTypes: ReadonlySet<string>,
): boolean {
  let current: TypeDefinition | undefined = type;
  while (current !== undefined) {
    if (operatorTypes.has(current.name)) {
      return true;
    }
    current = current.baseType === undefined ? undefined : typesByName.get(current.baseType);
  }
  return false;
}

function flattenTypeHierarchy(hierarchy: readonly TypeHierarchyNode[]): readonly TypeHierarchyNode[] {
  return hierarchy.flatMap((type) => [type, ...flattenTypeHierarchy(type.children)]);
}

function hierarchyFromNodes(nodes: readonly TypeHierarchyNode[]): readonly TypeHierarchyNode[] {
  const sorted = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
  const knownTypes = new Set(sorted.map((type) => type.id));
  const childrenByBase = new Map<string, TypeHierarchyNode[]>();
  for (const type of sorted) {
    if (type.extends === undefined || !knownTypes.has(type.extends)) {
      continue;
    }
    const children = childrenByBase.get(type.extends) ?? [];
    children.push(type);
    childrenByBase.set(type.extends, children);
  }
  const withChildren = (type: TypeHierarchyNode): TypeHierarchyNode => ({
    ...type,
    children: (childrenByBase.get(type.id) ?? []).map(withChildren),
  });
  return sorted
    .filter((type) => type.extends === undefined || !knownTypes.has(type.extends))
    .map(withChildren);
}
