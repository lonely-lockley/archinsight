import type {
  AttributeDefinition,
  ConstructorDefinition,
  EnumDefinition,
  LanguageSnapshot,
  OperatorDefinition,
  TypeDefinition,
} from "./contracts.js";

export const NOTHING = "Nothing";
export const CONTEXT = "Context";
export const EDGE = "Edge";
export const PROJECTION = "Projection";
export const PROJECTION_TERM = "ProjectionTerm";
export const TYPE_SLOT_REFERENCE = "TypeSlotReference";

export class TypeSystem {
  private readonly types: ReadonlyMap<string, TypeDefinition>;
  private readonly constructorsBySpelling: ReadonlyMap<string, readonly ConstructorDefinition[]>;
  private readonly operatorsBySpelling: ReadonlyMap<string, readonly OperatorDefinition[]>;
  private readonly enumValuesByType: ReadonlyMap<string, readonly string[]>;

  constructor(snapshot: LanguageSnapshot) {
    this.types = indexBy(snapshot.types, (type) => type.name);
    this.constructorsBySpelling = groupBy(snapshot.constructors, (constructor) => constructor.spelling);
    this.operatorsBySpelling = groupBy(snapshot.operators, (operator) => operator.spelling);
    this.enumValuesByType = indexEnumValues(snapshot.enums);
  }

  declaredTypes(): ReadonlySet<string> {
    return new Set(this.types.keys());
  }

  descendantTypes(type: string): readonly string[] {
    return [...this.types.keys()].filter((candidate) => candidate !== type && this.isAssignable(candidate, type));
  }

  isDeclared(type: string): boolean {
    return this.types.has(type);
  }

  isAssignable(type: string, expectedType: string): boolean {
    if (type === expectedType || expectedType === NOTHING) {
      return true;
    }
    let current: string | undefined = type;
    const visited = new Set<string>();
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const definition = this.types.get(current);
      current = definition?.baseType;
      if (current === expectedType) {
        return true;
      }
    }
    return false;
  }

  constructorsForExpectedType(expectedType: string): readonly ConstructorDefinition[] {
    return [...this.constructorsBySpelling.values()]
      .flat()
      .filter((constructor) => this.isAssignable(constructor.ownerType, expectedType));
  }

  findConstructor(spelling: string, expectedType = NOTHING): ConstructorDefinition | undefined {
    const candidates = this.constructorsBySpelling.get(spelling) ?? [];
    if (expectedType === NOTHING) {
      return candidates[0];
    }
    return candidates
      .filter((constructor) => this.isAssignable(constructor.ownerType, expectedType))
      .at(-1)
      ?? candidates[0];
  }

  hasOperatorConstructor(spelling: string): boolean {
    return this.operatorsBySpelling.has(spelling);
  }

  attributes(ownerType: string): ReadonlyMap<string, AttributeDefinition> {
    const result = new Map<string, AttributeDefinition>();
    for (const type of this.inheritanceChain(ownerType).reverse()) {
      for (const attribute of this.types.get(type)?.attributes ?? []) {
        result.set(attribute.name, attribute);
      }
    }
    return result;
  }

  attribute(ownerType: string, name: string): AttributeDefinition | undefined {
    return this.attributes(ownerType).get(name);
  }

  anonymousListAttribute(ownerType: string): AttributeDefinition | undefined {
    return this.attribute(ownerType, "_");
  }

  nestedElementType(attribute: AttributeDefinition): string | undefined {
    if (attribute.list) {
      return attribute.listElementType;
    }
    return isScalarType(attribute.type) ? undefined : attribute.type;
  }

  isNestedAttribute(attribute: AttributeDefinition): boolean {
    return this.nestedElementType(attribute) !== undefined;
  }

  isObjectAttribute(attribute: AttributeDefinition): boolean {
    return !attribute.list
      && this.types.has(attribute.type)
      && !isScalarType(attribute.type);
  }

  enumValues(type: string): readonly string[] {
    return this.enumValuesByType.get(type) ?? [];
  }

  baseTypes(type: string): readonly string[] {
    return this.inheritanceChain(type).slice(1);
  }

  operatorConstructorsFrom(ownerType: string): readonly OperatorDefinition[] {
    return [...this.operatorsBySpelling.values()]
      .flat()
      .filter((operator) => operator.leftType === undefined || this.isAssignable(ownerType, operator.leftType));
  }

  slotDomainTypes(): ReadonlySet<string> {
    return new Set([...this.operatorsBySpelling.values()]
      .flat()
      .filter((operator) => this.isAssignable(operator.ownerType, TYPE_SLOT_REFERENCE))
      .map((operator) => operator.targetType));
  }

  operatorConstructor(spelling: string, ownerType: string, targetType: string): OperatorDefinition | undefined {
    return this.operatorsBySpelling
      .get(spelling)
      ?.find((operator) => (operator.leftType === undefined || this.isAssignable(ownerType, operator.leftType))
        && this.isAssignable(targetType, operator.targetType));
  }

  relationOperatorConstructors(expectedType?: string): readonly OperatorDefinition[] {
    return this.operatorConstructorsFrom(PROJECTION_TERM)
      .filter((operator) => this.isAssignable(operator.targetType, PROJECTION_TERM))
      .filter((operator) => expectedType === undefined || this.isAssignable(operator.ownerType, expectedType));
  }

  relationOperatorConstructor(spelling: string): OperatorDefinition | undefined {
    return this.relationOperatorConstructors()
      .find((operator) => operator.spelling === spelling);
  }

  slotOperatorConstructor(spelling: string, ownerType: string, expectedType: string): OperatorDefinition | undefined {
    return this.operatorsBySpelling
      .get(spelling)
      ?.find((operator) => this.isAssignable(operator.ownerType, TYPE_SLOT_REFERENCE)
        && this.isAssignable(operator.ownerType, expectedType)
        && (operator.leftType === undefined || this.isAssignable(ownerType, operator.leftType)));
  }

  private inheritanceChain(type: string): string[] {
    const result: string[] = [];
    let current: string | undefined = type;
    const visited = new Set<string>();
    while (current !== undefined && !visited.has(current)) {
      result.push(current);
      visited.add(current);
      current = this.types.get(current)?.baseType;
    }
    return result;
  }
}

function indexBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    result.set(key(item), item);
  }
  return result;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const group = result.get(key(item)) ?? [];
    group.push(item);
    result.set(key(item), group);
  }
  return result;
}

function indexEnumValues(enums: readonly EnumDefinition[]): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const enumeration of enums) {
    result.set(enumeration.type, [...enumeration.values]);
  }
  return result;
}

function isScalarType(type: string): boolean {
  return type === "Text";
}
