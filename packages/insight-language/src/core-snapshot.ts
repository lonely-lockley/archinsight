import type {
  AttributeDefinition,
  PresentationDefinition,
  LanguageSnapshot,
  LanguageBuildResult,
  LanguageDiagnostic,
  OperatorDefinition,
  SourceLocation,
} from "./contracts.js";
import {
  AnonymousListAttributeDeclarationContext,
  AssignmentContext,
  AttributeDeclarationContext,
  DefineEnumDeclarationContext,
  DefineOperatorDeclarationContext,
  DefinePresentationDeclarationContext,
  DefineTypeDeclarationContext,
  ExtendEnumDeclarationContext,
  ExtendPresentationDeclarationContext,
  ExtendTypeDeclarationContext,
  OperatorConstructorDeclarationContext,
  PresentationAssignmentContext,
  PresentationSectionContext,
  TextValueContext,
  TypeConstructorDeclarationContext,
  TypeReferenceContext,
  TypeUnionContext,
} from "./generated/InsightParser.js";
import {
  firstChildByRule as firstChild,
  parseInsightSource,
  sourceLocationOf,
  textOf,
  type AntlrParseTreeLike,
} from "./parser-facade.js";
import { coreSource, coreSources } from "./generated/core-source.js";

interface MutableTypeDefinition {
  name: string;
  baseType?: string;
  attributes: AttributeDefinition[];
  declaration?: SourceLocation;
}

const BUILTIN_TYPES = ["Element", "Edge", "Nothing", "List", "Text", "TypeSlotReference"] as const;
const BUILTIN_LANGUAGE_SNAPSHOT: LanguageSnapshot = {
  schemaVersion: "<builtins>",
  types: BUILTIN_TYPES.map((name) => name === "TypeSlotReference"
    ? {
      name,
      attributes: [
        { name: "parentType", type: "Text", required: true },
        { name: "attributeName", type: "Text", required: true },
        { name: "attributeType", type: "Text", required: true },
      ],
    }
    : { name }),
  constructors: [],
  operators: [],
  enums: [],
  presentations: [],
};

interface CollectedLanguageSnapshotSource {
  readonly snapshot: LanguageSnapshot;
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly typeDeclarations: readonly DeclarationReference[];
  readonly typeExtensions: readonly DeclarationReference[];
  readonly typeReferences: readonly DeclarationReference[];
  readonly enumDeclarations: readonly DeclarationReference[];
  readonly enumExtensions: readonly DeclarationReference[];
  readonly presentationDeclarations: readonly DeclarationReference[];
  readonly presentationExtensions: readonly DeclarationReference[];
}

interface DeclarationReference {
  readonly name: string;
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export interface LanguageSnapshotSource {
  readonly sourceName: string;
  readonly source: string;
}

export function buildLanguageSnapshotFromCore(source: string): LanguageSnapshot {
  const result = collectLanguageSnapshotSource("core.ai", source, true);
  const diagnostics = [
    ...result.diagnostics,
    ...validateLanguageSnapshot(result.snapshot),
  ];
  if (diagnostics.length > 0) {
    throw new Error(`Cannot build core language snapshot:\n${diagnostics.map(formatDiagnostic).join("\n")}`);
  }
  return result.snapshot;
}

export function buildLanguageSnapshotFromCoreSources(sources: readonly LanguageSnapshotSource[]): LanguageSnapshot {
  const result = buildLanguageSnapshotResultFromSources(sources);
  const diagnostics = result.diagnostics;
  if (diagnostics.length > 0) {
    throw new Error(`Cannot build core language snapshot:\n${diagnostics.map(formatDiagnostic).join("\n")}`);
  }
  return {
    ...result.snapshot,
    schemaVersion: sources.map((source) => source.sourceName).join("+") || "core",
  };
}

export function buildLanguageSnapshotFromSources(
  sources: readonly LanguageSnapshotSource[],
  baseSnapshots: readonly LanguageSnapshot[] = [],
): LanguageSnapshot {
  return buildLanguageSnapshotResultFromSources(sources, baseSnapshots).snapshot;
}

export function buildLanguageSnapshotResultFromSources(
  sources: readonly LanguageSnapshotSource[],
  baseSnapshots: readonly LanguageSnapshot[] = [],
): LanguageBuildResult {
  const collected = sources.map((source) => collectLanguageSnapshotSource(source.sourceName, source.source, false));
  const validSnapshots = collected.flatMap((source) =>
    source.diagnostics.length === 0 ? [source.snapshot] : []
  );
  const snapshots = [BUILTIN_LANGUAGE_SNAPSHOT, ...baseSnapshots, ...validSnapshots];
  const snapshot = mergeLanguageSnapshots(snapshots);
  const baseTypeDeclarations = baseSnapshots.flatMap((base) => typeDeclarationsFromSnapshot(base, "<snapshot>"));
  const basePresentationDeclarations = baseSnapshots.flatMap((base) => presentationDeclarationsFromSnapshot(base, "<snapshot>"));
  const typeDeclarations = [
    ...builtinTypeDeclarations(baseTypeDeclarations),
    ...baseTypeDeclarations,
    ...collected.flatMap((source) => source.typeDeclarations),
  ];
  const typeExtensions = collected.flatMap((source) => source.typeExtensions);
  const enumDeclarations = [
    ...baseSnapshots.flatMap((base) => enumDeclarationsFromSnapshot(base, "<snapshot>")),
    ...collected.flatMap((source) => source.enumDeclarations),
  ];
  const sourceReferences = [
    ...collected.flatMap((source) => source.typeReferences),
    ...collected.flatMap((source) => source.presentationDeclarations),
    ...collected.flatMap((source) => source.presentationExtensions),
  ];
  const presentationDeclarations = [
    ...basePresentationDeclarations,
    ...collected.flatMap((source) => source.presentationDeclarations),
  ];
  const presentationExtensions = collected.flatMap((source) => source.presentationExtensions);
  return {
    snapshot,
    diagnostics: [
      ...collected.flatMap((source) => source.diagnostics),
      ...validateDuplicateDeclarations("TYPE_ALREADY_DECLARED", "Type", typeDeclarations),
      ...validateRepeatedTypeExtensions(typeExtensions),
      ...validateDuplicateDeclarations("ENUM_ALREADY_DECLARED", "Enum", enumDeclarations),
      ...validateDuplicateDeclarations("PRESENTATION_ALREADY_DECLARED", "Presentation", presentationDeclarations),
      ...validateEnumExtensions(enumDeclarations, collected.flatMap((source) => source.enumExtensions)),
      ...validatePresentationExtensions(presentationDeclarations, presentationExtensions),
      ...validateConstructorCollisions(snapshots),
      ...relocateSnapshotDiagnostics(validateLanguageSnapshot(snapshot), sourceReferences),
    ],
  };
}

export function mergeLanguageSnapshots(snapshots: readonly LanguageSnapshot[]): LanguageSnapshot {
  const types = new Map<string, LanguageSnapshot["types"][number]>();
  const constructors = new Map<string, LanguageSnapshot["constructors"][number]>();
  const operators = new Map<string, LanguageSnapshot["operators"][number]>();
  const enums = new Map<string, LanguageSnapshot["enums"][number]>();
  const presentations = new Map<string, PresentationDefinition>();
  const presentationExtensions: PresentationDefinition[] = [];

  for (const snapshot of snapshots) {
    for (const type of snapshot.types) {
      types.set(type.name, mergeTypeDefinition(types.get(type.name), type));
    }
    for (const constructor of snapshot.constructors) {
      constructors.set(`${constructor.ownerType}\0${constructor.spelling}`, constructor);
    }
    for (const operator of snapshot.operators) {
      operators.set(
        `${operator.ownerType}\0${operator.spelling}\0${operator.leftType ?? ""}\0${operator.targetType}`,
        operator,
      );
    }
    for (const enumeration of snapshot.enums) {
      enums.set(enumeration.type, mergeEnumDefinition(enums.get(enumeration.type), enumeration));
    }
    for (const presentation of snapshot.presentations ?? []) {
      if (!presentations.has(presentation.name)) {
        presentations.set(presentation.name, presentation);
      }
    }
    presentationExtensions.push(...(snapshot.presentationExtensions ?? []));
  }

  const unresolvedPresentationExtensions: PresentationDefinition[] = [];
  for (const extension of presentationExtensions) {
    const existing = presentations.get(extension.name);
    if (existing === undefined) {
      unresolvedPresentationExtensions.push(extension);
      continue;
    }
    presentations.set(extension.name, mergePresentationDefinition(existing, extension));
  }

  return {
    schemaVersion: snapshots.map((snapshot) => snapshot.schemaVersion).join("+") || "empty",
    types: [...types.values()],
    constructors: [...constructors.values()],
    operators: [...operators.values()],
    enums: [...enums.values()],
    presentations: [...presentations.values()],
    ...(unresolvedPresentationExtensions.length === 0 ? {} : { presentationExtensions: unresolvedPresentationExtensions }),
  };
}

function mergePresentationDefinition(
  existing: PresentationDefinition | undefined,
  next: PresentationDefinition,
): PresentationDefinition {
  if (existing === undefined) {
    return next;
  }
  return {
    name: existing.name,
    assignments: {
      ...(existing.assignments ?? {}),
      ...(next.assignments ?? {}),
    },
    ...optionalSource(next.source ?? existing.source),
    assignmentPositions: {
      ...(existing.assignmentPositions ?? {}),
      ...(next.assignmentPositions ?? {}),
    },
    assignmentValuePositions: {
      ...(existing.assignmentValuePositions ?? {}),
      ...(next.assignmentValuePositions ?? {}),
    },
    sectionPositions: {
      ...(existing.sectionPositions ?? {}),
      ...(next.sectionPositions ?? {}),
    },
    sections: mergePresentationSections(existing.sections ?? {}, next.sections ?? {}),
    sectionPropertyPositions: mergePresentationSectionPositions(
      existing.sectionPropertyPositions ?? {},
      next.sectionPropertyPositions ?? {},
    ),
  };
}

function optionalSource(source: SourceLocation | undefined): { readonly source?: SourceLocation } {
  return source === undefined ? {} : { source };
}

function mergePresentationSections(
  existing: Readonly<Record<string, Readonly<Record<string, string>>>>,
  next: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  const result: Record<string, Readonly<Record<string, string>>> = { ...existing };
  for (const [section, assignments] of Object.entries(next)) {
    result[section] = {
      ...(result[section] ?? {}),
      ...assignments,
    };
  }
  return result;
}

function mergePresentationSectionPositions(
  existing: Readonly<Record<string, Readonly<Record<string, SourceLocation>>>>,
  next: Readonly<Record<string, Readonly<Record<string, SourceLocation>>>>,
): Readonly<Record<string, Readonly<Record<string, SourceLocation>>>> {
  const result: Record<string, Readonly<Record<string, SourceLocation>>> = { ...existing };
  for (const [section, positions] of Object.entries(next)) {
    result[section] = {
      ...(result[section] ?? {}),
      ...positions,
    };
  }
  return result;
}

function mergeEnumDefinition(
  existing: LanguageSnapshot["enums"][number] | undefined,
  next: LanguageSnapshot["enums"][number],
): LanguageSnapshot["enums"][number] {
  if (existing === undefined) {
    return next;
  }
  return {
    type: existing.type,
    values: [...new Set([...existing.values, ...next.values])],
  };
}

function mergeTypeDefinition(
  existing: LanguageSnapshot["types"][number] | undefined,
  next: LanguageSnapshot["types"][number],
): LanguageSnapshot["types"][number] {
  if (existing === undefined) {
    return next;
  }
  const attributes = mergeAttributes(existing.attributes ?? [], next.attributes ?? []);
  return {
    name: existing.name,
    ...(next.baseType !== undefined ? { baseType: next.baseType } : existing.baseType === undefined ? {} : { baseType: existing.baseType }),
    ...(attributes.length === 0 ? {} : { attributes }),
    ...(next.declaration !== undefined ? { declaration: next.declaration } : existing.declaration === undefined ? {} : { declaration: existing.declaration }),
  };
}

function mergeAttributes(
  existing: readonly AttributeDefinition[],
  next: readonly AttributeDefinition[],
): readonly AttributeDefinition[] {
  const attributes = new Map<string, AttributeDefinition>();
  for (const attribute of existing) {
    attributes.set(attribute.name, attribute);
  }
  for (const attribute of next) {
    attributes.set(attribute.name, attribute);
  }
  return [...attributes.values()];
}

function collectLanguageSnapshotSource(
  sourceName: string,
  source: string,
  includeBuiltinTypes: boolean,
): CollectedLanguageSnapshotSource {
  const diagnostics: LanguageDiagnostic[] = [];
  const typeDeclarations: DeclarationReference[] = [];
  const typeExtensions: DeclarationReference[] = [];
  const enumDeclarations: DeclarationReference[] = [];
  const enumExtensions: DeclarationReference[] = [];
  const presentationExtensions: DeclarationReference[] = [];
  const parsed = parseInsightSource({ sourceName, source });
  diagnostics.push(...parsed.diagnostics);

  const types = new Map<string, MutableTypeDefinition>();
  if (includeBuiltinTypes) {
    addBuiltinTypes(types);
  }
  const constructors: Array<LanguageSnapshot["constructors"][number]> = [];
  const operators: OperatorDefinition[] = [];
  const enums: Array<LanguageSnapshot["enums"][number]> = [];
  const presentations: PresentationDefinition[] = [];
  const presentationExtensionDefinitions: PresentationDefinition[] = [];
  const typeReferences = parsed.syntax.descendants("typeReference")
    .map((reference) => typeReferenceDeclaration(reference as TypeReferenceContext, sourceName));
  const presentationDeclarations: DeclarationReference[] = [];

  for (const declaration of parsed.syntax.descendants("declaration")) {
    const typeDeclaration = firstChild<DefineTypeDeclarationContext>(declaration, "defineTypeDeclaration");
    if (typeDeclaration !== undefined) {
      const type = ensureType(types, text(typeDeclaration.typeIdentifier()));
      typeDeclarations.push({
        name: type.name,
        ...position(typeDeclaration.typeIdentifier(), sourceName),
      });
      type.declaration ??= position(typeDeclaration.typeIdentifier(), sourceName);
      const base = typeDeclaration.typeReference();
      if (base !== null) {
        type.baseType = typeReference(base).type;
      }
      for (const item of typeDeclaration.typeBodyItem()) {
        const constructor = item.typeConstructorDeclaration();
        if (constructor !== null) {
          constructors.push({
            spelling: constructorSpelling(constructor),
            ownerType: type.name,
            source: position(constructor.constructorName(), sourceName),
            ...defaultsProperty(constructorDefaults(constructor)),
          });
        }
        const attribute = item.attributeDeclaration();
        if (attribute !== null) {
          type.attributes.push(attributeDefinition(attribute));
        }
      }
      const anonymous = typeDeclaration.anonymousListAttributeDeclaration();
      if (anonymous !== null) {
        type.attributes.push(anonymousListAttribute(anonymous));
      }
      continue;
    }

    const operatorDeclaration = firstChild<DefineOperatorDeclarationContext>(declaration, "defineOperatorDeclaration");
    if (operatorDeclaration !== undefined) {
      const type = ensureType(types, text(operatorDeclaration.typeIdentifier()));
      type.declaration ??= position(operatorDeclaration.typeIdentifier(), sourceName);
      type.baseType = typeReference(operatorDeclaration.typeReference()).type;
      const implementation = operatorImplementation(operatorDeclaration);
      for (const item of operatorDeclaration.operatorBodyItem()) {
        const constructor = item.operatorConstructorDeclaration();
        if (constructor !== null) {
          operators.push(...operatorDefinitions(constructor, type.name, implementation, sourceName));
        }
        const attribute = item.attributeDeclaration();
        if (attribute !== null) {
          type.attributes.push(attributeDefinition(attribute));
        }
      }
      const anonymous = operatorDeclaration.anonymousListAttributeDeclaration();
      if (anonymous !== null) {
        type.attributes.push(anonymousListAttribute(anonymous));
      }
      continue;
    }

    const extension = firstChild<ExtendTypeDeclarationContext>(declaration, "extendTypeDeclaration");
    if (extension !== undefined) {
      const type = ensureType(types, text(extension.typeIdentifier()));
      typeExtensions.push({
        name: type.name,
        ...position(extension.typeIdentifier(), sourceName),
      });
      for (const item of extension.extendTypeBodyItem()) {
        const attribute = item.attributeDeclaration();
        if (attribute !== null) {
          type.attributes.push(attributeDefinition(attribute));
        }
      }
      const anonymous = extension.anonymousListAttributeDeclaration();
      if (anonymous !== null) {
        type.attributes.push(anonymousListAttribute(anonymous));
      }
      continue;
    }

    const enumDeclaration = firstChild<DefineEnumDeclarationContext>(declaration, "defineEnumDeclaration");
    if (enumDeclaration !== undefined) {
      const enumType = typeReference(enumDeclaration.typeReference()).type;
      enumDeclarations.push({
        name: enumType,
        ...position(enumDeclaration.typeReference(), sourceName),
      });
      enums.push({
        type: enumType,
        values: enumDeclaration.enumValueDeclaration().map((value) => text(value.identifier())),
      });
      continue;
    }

    const presentationDeclaration = firstChild<DefinePresentationDeclarationContext>(declaration, "definePresentationDeclaration");
    if (presentationDeclaration !== undefined) {
      presentationDeclarations.push({
        name: text(presentationDeclaration.presentationIdentifier()),
        ...position(presentationDeclaration.presentationIdentifier(), sourceName),
      });
      presentations.push(presentationDefinition(presentationDeclaration, sourceName));
      continue;
    }

    const presentationExtension = firstChild<ExtendPresentationDeclarationContext>(declaration, "extendPresentationDeclaration");
    if (presentationExtension !== undefined) {
      presentationExtensions.push({
        name: text(presentationExtension.presentationIdentifier()),
        ...position(presentationExtension.presentationIdentifier(), sourceName),
      });
      presentationExtensionDefinitions.push(presentationDefinition(presentationExtension, sourceName));
      continue;
    }

    const enumExtension = firstChild<ExtendEnumDeclarationContext>(declaration, "extendEnumDeclaration");
    if (enumExtension !== undefined) {
      const enumType = typeReference(enumExtension.typeReference()).type;
      enumExtensions.push({
        name: enumType,
        ...position(enumExtension.typeReference(), sourceName),
      });
      enums.push({
        type: enumType,
        values: enumExtension.enumValueDeclaration().map((value) => text(value.identifier())),
      });
    }
  }

  return {
    diagnostics,
    typeDeclarations,
    typeExtensions,
    typeReferences,
    enumDeclarations,
    enumExtensions,
    presentationDeclarations,
    presentationExtensions,
    snapshot: {
      schemaVersion: includeBuiltinTypes ? "core.ai" : "sources",
      types: [...types.values()].map((type) => ({
        name: type.name,
        ...(type.baseType === undefined ? {} : { baseType: type.baseType }),
        ...(type.attributes.length === 0 ? {} : { attributes: type.attributes }),
        ...(type.declaration === undefined ? {} : { declaration: type.declaration }),
      })),
      constructors,
      operators,
      enums,
      presentations,
      ...(presentationExtensionDefinitions.length === 0 ? {} : { presentationExtensions: presentationExtensionDefinitions }),
    },
  };
}

function presentationDefinition(
  presentation: DefinePresentationDeclarationContext | ExtendPresentationDeclarationContext,
  sourceName: string,
): PresentationDefinition {
  const assignments: Record<string, string> = {};
  const assignmentPositions: Record<string, SourceLocation> = {};
  const assignmentValuePositions: Record<string, SourceLocation> = {};
  const sections: Record<string, Record<string, string>> = {};
  const sectionPositions: Record<string, SourceLocation> = {};
  const sectionPropertyPositions: Record<string, Record<string, SourceLocation>> = {};
  for (const item of presentation.presentationBodyItem()) {
    const assignment = item.presentationAssignment();
    if (assignment !== null) {
      const property = text(assignment.presentationPropertyIdentifier());
      assignments[property] = textValue(assignment.textValue());
      assignmentPositions[property] = position(assignment.presentationPropertyIdentifier(), sourceName);
      assignmentValuePositions[property] = position(assignment.textValue(), sourceName);
      continue;
    }
    const section = item.presentationSection();
    if (section !== null) {
      const sectionName = text(section.identifier());
      sections[sectionName] = presentationAssignments(section.presentationAssignment());
      sectionPositions[sectionName] = position(section.identifier(), sourceName);
      sectionPropertyPositions[sectionName] = presentationAssignmentPositions(section.presentationAssignment(), sourceName);
    }
  }
  return {
    name: text(presentation.presentationIdentifier()),
    source: position(presentation.presentationIdentifier(), sourceName),
    ...(Object.keys(assignments).length === 0 ? {} : { assignments }),
    ...(Object.keys(assignmentPositions).length === 0 ? {} : { assignmentPositions }),
    ...(Object.keys(assignmentValuePositions).length === 0 ? {} : { assignmentValuePositions }),
    ...(Object.keys(sections).length === 0 ? {} : { sections }),
    ...(Object.keys(sectionPositions).length === 0 ? {} : { sectionPositions }),
    ...(Object.keys(sectionPropertyPositions).length === 0 ? {} : { sectionPropertyPositions }),
  };
}

function presentationAssignments(assignments: readonly PresentationAssignmentContext[]): Record<string, string> {
  return Object.fromEntries(assignments.map((assignment) => [
    text(assignment.presentationPropertyIdentifier()),
    textValue(assignment.textValue()),
  ]));
}

function presentationAssignmentPositions(
  assignments: readonly PresentationAssignmentContext[],
  sourceName: string,
): Record<string, SourceLocation> {
  return Object.fromEntries(assignments.map((assignment) => [
    text(assignment.presentationPropertyIdentifier()),
    position(assignment.presentationPropertyIdentifier(), sourceName),
  ]));
}

function addBuiltinTypes(types: Map<string, MutableTypeDefinition>): void {
  for (const name of BUILTIN_TYPES) {
    ensureType(types, name);
  }
}

function ensureType(types: Map<string, MutableTypeDefinition>, name: string): MutableTypeDefinition {
  const existing = types.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const created: MutableTypeDefinition = { name, attributes: [] };
  types.set(name, created);
  return created;
}

function attributeDefinition(attribute: AttributeDeclarationContext): AttributeDefinition {
  return {
    ...attributeType(attribute.typeReference()),
    name: text(attribute.identifier()),
    ...(attribute.REQUIRED() === null ? {} : { required: true }),
  };
}

function anonymousListAttribute(attribute: AnonymousListAttributeDeclarationContext): AttributeDefinition {
  return {
    name: "_",
    type: "List",
    list: true,
    listElementType: typeReference(attribute.typeReference()).type,
  };
}

function attributeType(reference: TypeReferenceContext): Omit<AttributeDefinition, "name" | "required"> {
  const resolved = typeReference(reference);
  return resolved.type === "List"
    ? { type: "List", list: true, ...(resolved.argument === undefined ? {} : { listElementType: resolved.argument }) }
    : { type: resolved.type };
}

function typeReference(reference: TypeReferenceContext): { readonly type: string; readonly argument?: string } {
  if (reference.LIST_TYPE() !== null) {
    const argument = reference.typeReference();
    return { type: "List", ...(argument === null ? {} : { argument: typeReference(argument).type }) };
  }
  const argument = reference.typeReference();
  return {
    type: text(reference.typeIdentifier()),
    ...(argument === null ? {} : { argument: typeReference(argument).type }),
  };
}

function constructorSpelling(constructor: TypeConstructorDeclarationContext): string {
  return text(constructor.constructorName());
}

function operatorDefinitions(
  constructor: OperatorConstructorDeclarationContext,
  ownerType: string,
  implementation: string | undefined,
  sourceName: string,
): readonly OperatorDefinition[] {
  const unions = constructor.typeUnion();
  const right = typeUnion(unions[0]!);
  const left = unions.length === 2 ? typeUnion(unions[1]!) : [undefined];
  const defaults = constructorDefaults(constructor);
  const source = position(constructor.constructorIdentifier(), sourceName);
  const result: OperatorDefinition[] = [];
  for (const leftType of left) {
    for (const targetType of right) {
      result.push({
        spelling: text(constructor.constructorIdentifier()),
        ownerType,
        ...(leftType === undefined ? {} : { leftType }),
        targetType,
        ...(implementation === undefined ? {} : { implementation }),
        source,
        ...defaultsProperty(defaults),
      });
    }
  }
  return result;
}

function operatorImplementation(operator: DefineOperatorDeclarationContext): string | undefined {
  for (const item of operator.operatorBodyItem()) {
    const implementation = firstChild<AntlrParseTreeLike>(item, "implementationAssignment");
    if (implementation !== undefined) {
      const value = firstChild<TextValueContext>(implementation, "textValue");
      return value === undefined ? "" : implementationValue(value);
    }
  }
  return undefined;
}

function implementationValue(value: TextValueContext): string {
  const raw = textValue(value);
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

function constructorDefaults(constructor: { assignment(): AssignmentContext[] }): Readonly<Record<string, string>> {
  return Object.fromEntries(
    constructor.assignment().map((assignment) => [
      text(assignment.attributeName()),
      textValue(assignment.textValue()),
    ]),
  );
}

function textValue(value: TextValueContext): string {
  return value.TEXT().map((token) => token?.getText() ?? "").join("");
}

function defaultsProperty(defaults: Readonly<Record<string, string>>): { readonly defaults?: Readonly<Record<string, string>> } {
  return Object.keys(defaults).length === 0 ? {} : { defaults };
}

export function validateLanguageSnapshot(snapshot: LanguageSnapshot): readonly LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  validateTypeReferences(snapshot, diagnostics);
  validateRequiredConstructors(snapshot, diagnostics);
  return diagnostics;
}

function validateTypeReferences(snapshot: LanguageSnapshot, diagnostics: LanguageDiagnostic[]): void {
  for (const type of snapshot.types) {
    if (type.baseType !== undefined) {
      validateDeclaredType(snapshot, type.baseType, diagnostics);
    }
    for (const attribute of type.attributes ?? []) {
      validateDeclaredType(snapshot, attribute.type, diagnostics);
      if (attribute.listElementType !== undefined) {
        validateDeclaredType(snapshot, attribute.listElementType, diagnostics);
      }
    }
  }
  for (const constructor of snapshot.constructors) {
    validateDeclaredType(snapshot, constructor.ownerType, diagnostics);
  }
  for (const operator of snapshot.operators) {
    validateDeclaredType(snapshot, operator.ownerType, diagnostics);
    if (operator.leftType !== undefined) {
      validateDeclaredType(snapshot, operator.leftType, diagnostics);
    }
    validateDeclaredType(snapshot, operator.targetType, diagnostics);
  }
  for (const enumeration of snapshot.enums) {
    validateDeclaredType(snapshot, enumeration.type, diagnostics);
  }
  for (const presentation of snapshot.presentations ?? []) {
    if (!isDeclaredType(snapshot, presentation.name)) {
      diagnostics.push(snapshotDiagnostic(
        "UNKNOWN_PRESENTATION_TYPE",
        `Presentation target type '${presentation.name}' is not declared`,
      ));
    }
  }
}

function validateDeclaredType(
  snapshot: LanguageSnapshot,
  type: string,
  diagnostics: LanguageDiagnostic[],
): void {
  if (isBuiltinType(type)) {
    return;
  }
  if (isDeclaredType(snapshot, type)) {
    return;
  }
  diagnostics.push(snapshotDiagnostic(
    "TYPE_NOT_DECLARED",
    `Type '${type}' is not declared`,
  ));
}

function isDeclaredType(snapshot: LanguageSnapshot, type: string): boolean {
  return isBuiltinType(type) || snapshot.types.some((candidate) => candidate.name === type);
}

function validateRequiredConstructors(snapshot: LanguageSnapshot, diagnostics: LanguageDiagnostic[]): void {
  const constructedTypes = new Set([
    ...snapshot.constructors.map((constructor) => constructor.ownerType),
    ...snapshot.operators.map((operator) => operator.ownerType),
  ]);
  for (const type of snapshot.types) {
    if (isBuiltinType(type.name)
      || isAbstractBaseType(snapshot, type.name)
      || !requiresConstructor(snapshot, type.name)
      || constructedTypes.has(type.name)) {
      continue;
    }
    diagnostics.push(snapshotDiagnostic(
      "TYPE_CONSTRUCTOR_MISSING",
      `Type '${type.name}' must declare at least one constructor`,
    ));
  }
}

const CONSTRUCTORLESS_EXTENSION_POINT_TYPES = new Set(["CodeElement"]);

function requiresConstructor(snapshot: LanguageSnapshot, type: string): boolean {
  if (CONSTRUCTORLESS_EXTENSION_POINT_TYPES.has(type)) {
    return false;
  }
  if (type !== "Environment" && isAssignable(snapshot, type, "Environment")) {
    return false;
  }
  return type === "Context"
    || (type !== "Element" && isAssignable(snapshot, type, "Element"))
    || (type !== "Edge" && isAssignable(snapshot, type, "Edge"));
}

function isAbstractBaseType(snapshot: LanguageSnapshot, type: string): boolean {
  return snapshot.types.some((candidate) => candidate.name !== type
    && inheritanceChain(snapshot, candidate.name).includes(type));
}

function isAssignable(snapshot: LanguageSnapshot, type: string, expectedType: string): boolean {
  return inheritanceChain(snapshot, type).includes(expectedType);
}

function isBuiltinType(type: string): boolean {
  return (BUILTIN_TYPES as readonly string[]).includes(type);
}

function validateConstructorCollisions(snapshots: readonly LanguageSnapshot[]): readonly LanguageDiagnostic[] {
  return [
    ...validateTypeConstructorCollisions(snapshots.flatMap((snapshot) => snapshot.constructors)),
    ...validateOperatorConstructorCollisions(snapshots.flatMap((snapshot) => snapshot.operators)),
  ];
}

function validateTypeConstructorCollisions(
  constructors: readonly LanguageSnapshot["constructors"][number][],
): readonly LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const bySpelling = groupByItems(constructors, (constructor) => constructor.spelling);
  for (const [spelling, overloads] of bySpelling) {
    if (overloads.length < 2) {
      continue;
    }
    const original = overloads[0]!;
    for (const constructor of overloads.slice(1)) {
      diagnostics.push({
        code: "CONSTRUCTOR_ALREADY_DECLARED",
        message: `Constructor '${spelling}' is already declared for type '${original.ownerType}'`,
        ...snapshotDiagnosticLocation(constructor.source),
      });
    }
  }
  return diagnostics;
}

function validateOperatorConstructorCollisions(
  operators: readonly LanguageSnapshot["operators"][number][],
): readonly LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const bySignature = groupByItems(operators, (operator) =>
    `${operator.spelling}\0${operator.leftType ?? ""}\0${operator.targetType}`
  );
  for (const [signature, overloads] of bySignature) {
    if (overloads.length < 2) {
      continue;
    }
    const original = overloads[0]!;
    const spelling = signature.split("\0")[0]!;
    for (const operator of overloads.slice(1)) {
      diagnostics.push({
        code: "CONSTRUCTOR_ALREADY_DECLARED",
        message: `Constructor '${spelling}' is already declared for type '${original.ownerType}'`,
        ...snapshotDiagnosticLocation(operator.source),
      });
    }
  }
  return diagnostics;
}

function builtinTypeDeclarations(baseDeclarations: readonly DeclarationReference[]): readonly DeclarationReference[] {
  const declared = new Set(baseDeclarations.map((declaration) => declaration.name));
  return BUILTIN_TYPES
    .filter((name) => !declared.has(name))
    .map((name) => ({
      name,
      sourceName: "<builtins>",
      line: 1,
      column: 1,
    }));
}

function typeDeclarationsFromSnapshot(snapshot: LanguageSnapshot, sourceName: string): readonly DeclarationReference[] {
  return snapshot.types.map((type) => ({
    name: type.name,
    sourceName: type.declaration?.sourceName ?? sourceName,
    line: type.declaration?.line ?? 1,
    column: type.declaration?.column ?? 1,
  }));
}

function typeReferenceDeclaration(reference: TypeReferenceContext, sourceName: string): DeclarationReference {
  const resolved = typeReference(reference);
  return {
    name: resolved.argument ?? resolved.type,
    ...position(reference, sourceName),
  };
}

function enumDeclarationsFromSnapshot(snapshot: LanguageSnapshot, sourceName: string): readonly DeclarationReference[] {
  return snapshot.enums.map((enumeration) => ({
    name: enumeration.type,
    sourceName,
    line: 1,
    column: 1,
  }));
}

function presentationDeclarationsFromSnapshot(snapshot: LanguageSnapshot, sourceName: string): readonly DeclarationReference[] {
  return (snapshot.presentations ?? []).map((presentation) => ({
    name: presentation.name,
    sourceName: presentation.source?.sourceName ?? sourceName,
    line: presentation.source?.line ?? 1,
    column: presentation.source?.column ?? 1,
  }));
}

function validateDuplicateDeclarations(
  code: string,
  label: string,
  declarations: readonly DeclarationReference[],
): readonly LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const seen = new Map<string, DeclarationReference>();
  for (const declaration of declarations) {
    const previous = seen.get(declaration.name);
    if (previous === undefined) {
      seen.set(declaration.name, declaration);
      continue;
    }
    diagnostics.push({
      code,
      message: `${label} '${declaration.name}' is already declared`,
      ...diagnosticPosition(declaration),
    });
  }
  return diagnostics;
}

function validateRepeatedTypeExtensions(extensions: readonly DeclarationReference[]): readonly LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const seen = new Map<string, DeclarationReference>();
  for (const extension of extensions) {
    const previous = seen.get(extension.name);
    if (previous === undefined) {
      seen.set(extension.name, extension);
      continue;
    }
    diagnostics.push({
      level: "WARNING",
      code: "TYPE_EXTENDED_MULTIPLE_TIMES",
      message: `Type '${extension.name}' is extended more than once; keep type extensions in one definition file to avoid uncontrolled schema changes`,
      ...diagnosticPosition(extension),
    });
  }
  return diagnostics;
}

function relocateSnapshotDiagnostics(
  diagnostics: readonly LanguageDiagnostic[],
  references: readonly DeclarationReference[],
): readonly LanguageDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    if (diagnostic.sourceName !== "<snapshot>") {
      return diagnostic;
    }
    const missingType = /^Type '([^']+)' is not declared$/.exec(diagnostic.message)?.[1]
      ?? /^Presentation target type '([^']+)' is not declared$/.exec(diagnostic.message)?.[1];
    if (missingType === undefined) {
      return diagnostic;
    }
    const reference = references.find((item) => item.name === missingType);
    return reference === undefined
      ? diagnostic
      : {
          ...diagnostic,
          ...diagnosticPosition(reference),
        };
  });
}

function validateEnumExtensions(
  declarations: readonly DeclarationReference[],
  extensions: readonly DeclarationReference[],
): readonly LanguageDiagnostic[] {
  const declared = new Set(declarations.map((declaration) => declaration.name));
  return extensions
    .filter((extension) => !declared.has(extension.name))
    .map((extension) => ({
      code: "ENUM_NOT_DECLARED",
      message: `Enum for type '${extension.name}' is not declared`,
      ...diagnosticPosition(extension),
    }));
}

function validatePresentationExtensions(
  declarations: readonly DeclarationReference[],
  extensions: readonly DeclarationReference[],
): readonly LanguageDiagnostic[] {
  const declared = new Set(declarations.map((declaration) => declaration.name));
  return extensions
    .filter((extension) => !declared.has(extension.name))
    .map((extension) => ({
      code: "PRESENTATION_NOT_DECLARED",
      message: `Presentation '${extension.name}' is not declared`,
      ...diagnosticPosition(extension),
    }));
}

function groupByItems<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const group = result.get(key(item)) ?? [];
    group.push(item);
    result.set(key(item), group);
  }
  return result;
}

function snapshotDiagnostic(code: string, message: string): LanguageDiagnostic {
  return {
    code,
    message,
    sourceName: "<snapshot>",
    line: 1,
    column: 1,
  };
}

function snapshotDiagnosticLocation(
  source: SourceLocation | undefined,
): Pick<LanguageDiagnostic, "sourceName" | "line" | "column" | "endLine" | "endColumn"> {
  return source ?? {
    sourceName: "<snapshot>",
    line: 1,
    column: 1,
  };
}

function inheritanceChain(snapshot: LanguageSnapshot, type: string): readonly string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = type;
  while (current !== undefined && !visited.has(current)) {
    result.push(current);
    visited.add(current);
    current = snapshot.types.find((candidate) => candidate.name === current)?.baseType;
  }
  return result;
}

function typeUnion(union: TypeUnionContext): readonly string[] {
  return union.typeReference().map((reference) => typeReference(reference).type);
}

function text(node: AntlrParseTreeLike | null): string {
  return node === null ? "" : textOf(node);
}

function position(node: unknown, sourceName: string): Omit<DeclarationReference, "name"> {
  return sourceLocationOf(node as AntlrParseTreeLike | undefined, sourceName);
}

function diagnosticPosition(
  item: Omit<DeclarationReference, "name">,
): Pick<LanguageDiagnostic, "sourceName" | "line" | "column" | "endLine" | "endColumn"> {
  return {
    sourceName: item.sourceName,
    line: item.line,
    column: item.column,
    ...(item.endLine === undefined ? {} : { endLine: item.endLine }),
    ...(item.endColumn === undefined ? {} : { endColumn: item.endColumn }),
  };
}

function formatDiagnostic(diagnostic: LanguageDiagnostic): string {
  return `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code}: ${diagnostic.message}`;
}

export const coreLanguageSnapshot: LanguageSnapshot = buildLanguageSnapshotFromCoreSources(coreSources);
