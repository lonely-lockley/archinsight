import type { LanguageSnapshot } from "./contracts.js";
import { ATTRIBUTE_CAPABILITIES } from "./semantic-capabilities.js";
import { TypeSystem } from "./type-system.js";
import {
  AiqQueryError, type Expression, type ParsedQuery, type QueryPattern, type QuerySourceRange,
  type TableExpression, type TableValueExpression, type ValueExpression,
} from "./query-syntax.js";

export const relationshipProperties = [
  "type", "operator", "context", "sourceIdentity", "derived", "projected",
  "projectionRoot", "originSource", "originTarget",
];
const nodeProperties = new Set([
  "id", "type", "kind", "context", "sourceIdentity", "source", "parent", "constructor",
  "baseType", "baseTypes", "deployed", "cloneOf", "binding", "bindingOwner",
]);
type Binding = { kind: "node" | "edge"; types: readonly string[]; label: string };
type Bindings = Map<string, Binding>;
type Predicate = Expression | TableExpression;
type Value = ValueExpression | TableValueExpression;

/** Use the project schema so an optional attribute is valid even without a populated instance. */
export function validateQueryProperties(query: ParsedQuery, schema: LanguageSnapshot): void {
  const types = new TypeSystem(schema);
  const bindings: Bindings = new Map();
  const names = schema.types.map((type) => type.name);
  const edge: Binding = {kind: "edge", types: names.filter((name) => types.isAssignable(name, "Edge")), label: "Edge"};
  const node: Binding = {kind: "node", types: names.filter((name) => !types.isAssignable(name, "Edge")), label: "node"};

  function restrict(binding: Binding, label?: string): Binding {
    if (!label || (label === "Element" && binding.kind === "node")) return binding;
    return {...binding, types: binding.types.filter((name) => types.isAssignable(name, label)), label};
  }

  function check(binding: Binding | undefined, property: string, range?: QuerySourceRange): void {
    if (!binding) return; // Computed records and scalars have no Insight type.
    if (binding.kind === "edge" ? relationshipProperties.includes(property) : nodeProperties.has(property)) return;
    const declared = binding.types.some((name) => {
      const attributes = types.attributes(name);
      if (attributes.has(property)) return true;
      return binding.kind === "node" && (property === "runsOn" || property === "uses")
        && [...attributes.values()].some((attr) => attr.capabilities?.includes(ATTRIBUTE_CAPABILITIES.deploymentActions));
    });
    if (!declared) {
      throw new AiqQueryError("AIQ_UNKNOWN_PROPERTY", `Property '${property}' is not declared on ${binding.label}`, range);
    }
  }

  function value(expr: Value, env: Bindings): void {
    switch (expr.kind) {
      case "property":
        if ("alias" in expr) check(env.get(expr.alias), expr.property, expr.range);
        else {
          if (expr.target.kind === "binding") check(env.get(expr.target.alias), expr.property, expr.range);
          value(expr.target, env);
        }
        break;
      case "function":
        expr.arguments.forEach((arg) => value(arg, env));
        break;
      case "list":
        expr.values.forEach((item) => value(item, env));
        break;
      case "listComprehension":
      case "quantifier": {
        value(expr.source, env);
        const local = new Map(env);
        local.delete(expr.alias);
        predicate(expr.predicate, local);
        if (expr.kind === "listComprehension") value(expr.projection, local);
        break;
      }
    }
  }

  function narrow(expr: Predicate | undefined, env: Bindings): void {
    if (!expr) return;
    if (expr.kind === "and") {
      narrow(expr.left, env);
      narrow(expr.right, env);
    } else if (expr.kind === "or") {
      const left = new Map(env);
      const right = new Map(env);
      narrow(expr.left, left);
      narrow(expr.right, right);
      for (const [alias, original] of env) {
        const a = left.get(alias)!;
        const b = right.get(alias)!;
        if (a !== original && b !== original) env.set(alias, {
          ...original, types: [...new Set([...a.types, ...b.types])], label: a.label === b.label ? a.label : `${a.label} or ${b.label}`,
        });
      }
    } else if (expr.kind === "is" && expr.left.kind === "binding" && types.isDeclared(expr.target)) {
      const binding = env.get(expr.left.alias);
      if (binding) env.set(expr.left.alias, restrict(binding, expr.target));
    }
  }

  function predicate(expr: Predicate | undefined, env: Bindings): void {
    if (!expr) return;
    if (expr.kind === "and" || expr.kind === "or") {
      const local = new Map(env);
      if (expr.kind === "and") narrow(expr, local);
      predicate(expr.left, local);
      predicate(expr.right, local);
    } else if (expr.kind === "not") predicate(expr.expression, env);
    else if (expr.kind === "truthy") value(expr.expression, env);
    else {
      value(expr.left, env);
      if (expr.kind !== "is") value(expr.right, env);
    }
  }

  function match(pattern: QueryPattern, where: Predicate | undefined, optional: boolean): void {
    const local = new Map(bindings);
    for (const term of [pattern.left, pattern.right]) {
      if (term) local.set(term.alias, restrict(local.get(term.alias) ?? node, term.label));
    }
    const rel = pattern.relationship;
    if (rel?.alias && !pattern.path) local.set(rel.alias, local.get(rel.alias) ?? edge);
    narrow(where, local);
    for (const term of [pattern.left, pattern.right, rel]) {
      if (!term) continue;
      for (const name of Object.keys(term.properties)) {
        check(term.alias ? local.get(term.alias) : edge, name, term.range);
      }
    }
    predicate(where, local);
    for (const [name, binding] of local) {
      if (!optional || !bindings.has(name)) bindings.set(name, binding);
    }
  }

  if (query.kind === "graph") {
    for (const clause of query.matches) match(clause.pattern, clause.where, clause.optional);
    if (query.groupBy) value(query.groupBy, bindings);
    return;
  }
  for (const clause of query.clauses) {
    if (clause.kind === "match") match(clause.clause.pattern, clause.clause.where, clause.clause.optional);
    else if (clause.kind === "unwind") {
      value(clause.expression, bindings);
      bindings.delete(clause.alias);
    } else {
      const next: Bindings = new Map();
      for (const item of clause.clause.projection.items) {
        value(item.expression, bindings);
        if (item.expression.kind !== "binding") continue;
        const binding = bindings.get(item.expression.alias);
        if (binding) next.set(item.alias ?? item.expression.alias, binding);
      }
      bindings.clear();
      for (const [name, binding] of next) bindings.set(name, binding);
      narrow(clause.clause.where, bindings);
      predicate(clause.clause.where, bindings);
    }
  }
  for (const item of query.projection.items) value(item.expression, bindings);
}
