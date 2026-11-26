import { firstChildByRule, ruleName, sourceLocationOf, textOf, type AntlrParseTreeLike } from "./parser-facade.js";
import type { LanguageDiagnostic } from "./contracts.js";
import type { TypeSystem } from "./type-system.js";
import { OPERATOR_CAPABILITIES } from "./semantic-capabilities.js";

export interface OperatorInvocationSyntax<T extends AntlrParseTreeLike = AntlrParseTreeLike> {
  readonly operator: T;
  readonly target: T | undefined;
  readonly body: T | undefined;
  readonly environmentQualifier: T | undefined;
  readonly alias: T | undefined;
  readonly anonymousImport: T | undefined;
  readonly prefix: boolean;
}

// Parsing cannot distinguish a constructor from an operator or a bare reference
// without the project's declarations. Every consumer uses this same CST view.
export function readOperatorInvocation<T extends AntlrParseTreeLike>(
  node: T,
  ruleNames: readonly string[],
): OperatorInvocationSyntax<T> | undefined {
  const child = (name: string) => firstChildByRule<T>(node, name, ruleNames);
  const prefix = child("namedPrefixOperatorInvocation");
  const reference = ruleName(node, ruleNames) === "listValue";
  const anonymousImport = child("anonymousImportDeclaration");
  if (reference && anonymousImport !== undefined) return undefined;
  const operator = prefix ?? child("operatorIdentifier") ?? child("elementConstructor")
    ?? (reference ? child("identifierReference") : undefined);
  if (operator === undefined) return undefined;
  const target = reference ? undefined : prefix !== undefined
    ? child("elementConstructor")
    : child("identifierReference") ?? child("identifierDeclaration");
  return { operator, target, alias: child("importAlias"), body: child("objectBody"), anonymousImport, environmentQualifier: child("routeEnvironmentQualifier"), prefix: prefix !== undefined };
}

export function isOperatorInvocation(
  node: AntlrParseTreeLike,
  ruleNames: readonly string[],
  typeSystem: TypeSystem,
  expectedType?: string,
): boolean {
  if (ruleName(node, ruleNames) === "operatorInvocation") return true;
  const invocation = readOperatorInvocation(node, ruleNames);
  if (invocation === undefined || !typeSystem.hasOperatorConstructor(textOf(invocation.operator))) return false;
  return ruleName(node, ruleNames) !== "listValue" || expectedType === undefined
    || typeSystem.operatorConstructorsForExpectedType(expectedType).length > 0;
}

export function operatorInvocationDiagnostic(
  invocation: OperatorInvocationSyntax,
  ownerType: string,
  expectedType: string,
  typeSystem: TypeSystem,
  sourceName: string,
): LanguageDiagnostic | undefined {
  const spelling = textOf(invocation.operator);
  const known = typeSystem.hasOperatorConstructor(spelling);
  const candidates = typeSystem.operatorConstructorsFrom(ownerType, expectedType);
  const compatible = candidates.some((operator) => operator.spelling === spelling);
  if (compatible && invocation.environmentQualifier !== undefined && !candidates.some((operator) =>
    operator.spelling === spelling && typeSystem.operatorHasCapability(operator, OPERATOR_CAPABILITIES.deploymentRoute))) {
    return {
      code: "ROUTE_QUALIFIER_NOT_ALLOWED",
      message: "Only a wire route selection accepts an environment qualifier",
      ...sourceLocationOf(invocation.environmentQualifier, sourceName),
    };
  }
  const hasCapability = (capability: string) => candidates.some((operator) =>
    operator.spelling === spelling && typeSystem.operatorHasCapability(operator, capability));
  if (compatible && invocation.alias && !hasCapability(OPERATOR_CAPABILITIES.deploymentUse)) {
    return { code: "TYPE_MISMATCH", message: "Only an infrastructure use can declare a binding alias",
      ...sourceLocationOf(invocation.alias, sourceName) };
  }
  if (compatible && hasCapability(OPERATOR_CAPABILITIES.deploymentShare)) {
    if (!invocation.anonymousImport) return { code: "IDENTIFIER_REQUIRED",
      message: "A shared binding requires 'from <owner>'", ...sourceLocationOf(invocation.operator, sourceName) };
    if (invocation.body) return { code: "TYPE_MISMATCH", message: "Set infrastructure overrides on the owning use",
      ...sourceLocationOf(invocation.body, sourceName) };
  }
  if (compatible && invocation.target !== undefined) return undefined;
  return {
    code: !known ? "CONSTRUCTOR_NOT_DECLARED" : !compatible ? "TYPE_MISMATCH" : "IDENTIFIER_REQUIRED",
    message: !known ? `Unknown operator '${spelling}'`
      : !compatible ? `Operator '${spelling}' is not compatible with '${ownerType}' (expected '${expectedType}')`
      : "Target identifier is required",
    ...sourceLocationOf(invocation.operator, sourceName),
  };
}
