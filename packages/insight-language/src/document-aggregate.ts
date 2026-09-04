import type { AttributeDefinition } from "./contracts.js";
import { TYPE_CAPABILITIES } from "./semantic-capabilities.js";
import { TypeSystem } from "./type-system.js";

export interface DocumentAggregateRootResolution {
  readonly type: string;
  readonly ambiguousTypes: readonly string[];
}

export function resolveDocumentAggregateRoot(
  typeSystem: TypeSystem,
  requiredGroupNames: ReadonlySet<string>,
): DocumentAggregateRootResolution | undefined {
  const candidates = aggregateRootSchemaTypes(typeSystem);
  if (candidates.length === 0) {
    return undefined;
  }
  const matching = candidates.filter((type) => [...requiredGroupNames]
    .every((name) => typeSystem.attribute(type, name) !== undefined));
  if (matching.length === 1) {
    return { type: matching[0]!, ambiguousTypes: [] };
  }
  if (matching.length > 1) {
    return { type: matching[0]!, ambiguousTypes: matching };
  }
  return candidates.length === 1
    ? { type: candidates[0]!, ambiguousTypes: [] }
    : { type: candidates[0]!, ambiguousTypes: candidates };
}

export function isDocumentAggregateMember(typeSystem: TypeSystem, type: string): boolean {
  return typeSystem.typeHasCapability(type, TYPE_CAPABILITIES.documentAggregateMember);
}

export function aggregateGroupAttribute(
  typeSystem: TypeSystem,
  rootType: string | undefined,
  memberType: string,
  name: string,
): AttributeDefinition | undefined {
  if (rootType === undefined
    || !typeSystem.typeHasCapability(rootType, TYPE_CAPABILITIES.documentAggregateRoot)
    || !isDocumentAggregateMember(typeSystem, memberType)) {
    return undefined;
  }
  return typeSystem.attribute(rootType, name);
}

export function aggregateMemberType(typeSystem: TypeSystem, rootType: string): string | undefined {
  const attribute = typeSystem.anonymousListAttribute(rootType);
  return attribute === undefined ? undefined : typeSystem.nestedElementType(attribute);
}

function aggregateRootSchemaTypes(typeSystem: TypeSystem): readonly string[] {
  const declaredRoots = typeSystem.typesWithCapability(TYPE_CAPABILITIES.documentAggregateRoot)
    .filter((type) => typeSystem.declaresCapability(type, TYPE_CAPABILITIES.documentAggregateRoot))
    .sort();
  const candidates = declaredRoots.flatMap((root) => {
    const inferredSchemas = typeSystem.descendantTypes(root)
      .filter((type) => typeSystem.typeHasCapability(type, TYPE_CAPABILITIES.documentAggregateRoot))
      .filter((type) => typeSystem.constructorsDeclaredBy(type).length === 0);
    return inferredSchemas.length === 0 ? [root] : inferredSchemas;
  });
  return [...new Set(candidates)].sort();
}
