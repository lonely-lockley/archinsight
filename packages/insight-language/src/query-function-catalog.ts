export type AiqFunctionKind = "scalar" | "aggregate" | "quantifier";

export interface AiqFunctionDefinition {
  readonly name: string;
  readonly kind: AiqFunctionKind;
  readonly signature: string;
  readonly documentation: string;
  readonly minArguments: number;
  readonly maxArguments: number;
  readonly acceptsDistinct?: boolean;
  readonly acceptsStar?: boolean;
}

export const AIQ_FUNCTIONS: readonly AiqFunctionDefinition[] = Object.freeze([
  functionDefinition("count", "aggregate", "count(value) or count(*)", "Count non-null values, or rows with count(*).", 1, 1, true, true),
  functionDefinition("collect", "aggregate", "collect([DISTINCT] value)", "Collect non-null values in input order.", 1, 1, true),
  functionDefinition("min", "aggregate", "min(value)", "Return the smallest number or string.", 1, 1, true),
  functionDefinition("max", "aggregate", "max(value)", "Return the largest number or string.", 1, 1, true),
  functionDefinition("sum", "aggregate", "sum(value)", "Sum numeric values.", 1, 1, true),
  functionDefinition("avg", "aggregate", "avg(value)", "Average numeric values.", 1, 1, true),
  functionDefinition("nodes", "scalar", "nodes(path)", "Return the nodes of a path in traversal order."),
  functionDefinition("relationships", "scalar", "relationships(path)", "Return the relationships of a path in traversal order."),
  functionDefinition("length", "scalar", "length(path)", "Return the number of relationships in a path."),
  functionDefinition("all", "quantifier", "all(x IN list WHERE predicate)", "True when every list item satisfies the predicate."),
  functionDefinition("any", "quantifier", "any(x IN list WHERE predicate)", "True when at least one list item satisfies the predicate."),
  functionDefinition("elementId", "scalar", "elementId(value)", "Return the stable full identity of a node or relationship."),
  functionDefinition("startNode", "scalar", "startNode(relationship)", "Return the authored source endpoint."),
  functionDefinition("endNode", "scalar", "endNode(relationship)", "Return the authored target endpoint."),
  functionDefinition("coalesce", "scalar", "coalesce(value, fallback, ...)", "Return the first non-null value.", 1, Number.MAX_SAFE_INTEGER),
  functionDefinition("size", "scalar", "size(list)", "Return the length of a list or string."),
  functionDefinition("annotations", "scalar", "annotations(value)", "Return annotation metadata records."),
  functionDefinition("originId", "scalar", "originId(relationship)", "Return the originating linked relationship identity."),
  functionDefinition("toInteger", "scalar", "toInteger(value)", "Convert a scalar to a safe integer, or null."),
  functionDefinition("toFloat", "scalar", "toFloat(value)", "Convert a scalar to a finite number, or null."),
  functionDefinition("toBoolean", "scalar", "toBoolean(value)", "Convert a boolean or true/false string, or return null."),
  functionDefinition("toString", "scalar", "toString(value)", "Convert a scalar to a string, or return null."),
]);

const byName = new Map(AIQ_FUNCTIONS.map((definition) => [definition.name.toLowerCase(), definition]));

export function aiqFunction(name: string): AiqFunctionDefinition | undefined {
  return byName.get(name.toLowerCase());
}

function functionDefinition(
  name: string,
  kind: AiqFunctionKind,
  signature: string,
  documentation: string,
  minArguments = 1,
  maxArguments = 1,
  acceptsDistinct = false,
  acceptsStar = false,
): AiqFunctionDefinition {
  return Object.freeze({
    name, kind, signature, documentation, minArguments, maxArguments,
    ...(acceptsDistinct ? { acceptsDistinct: true } : {}),
    ...(acceptsStar ? { acceptsStar: true } : {}),
  });
}
