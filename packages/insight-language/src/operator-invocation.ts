import { firstChildByRule, ruleName, sourceLocationOf, textOf, type AntlrParseTreeLike } from "./parser-facade.js";
import type { LanguageDiagnostic } from "./contracts.js";
import type { TypeSystem } from "./type-system.js";

export interface OperatorInvocationSyntax<T extends AntlrParseTreeLike = AntlrParseTreeLike> {
  readonly operator: T;
  readonly target: T | undefined;
  readonly body: T | undefined;
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
  return { operator, target, body: child("objectBody"), anonymousImport, prefix: prefix !== undefined };
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
  const compatible = typeSystem.operatorConstructorsFrom(ownerType, expectedType)
    .some((operator) => operator.spelling === spelling);
  if (compatible && invocation.target !== undefined) return undefined;
  return {
    code: !known ? "CONSTRUCTOR_NOT_DECLARED" : !compatible ? "TYPE_MISMATCH" : "IDENTIFIER_REQUIRED",
    message: !known ? `Unknown operator '${spelling}'`
      : !compatible ? `Operator '${spelling}' is not compatible with '${ownerType}' (expected '${expectedType}')`
      : "Target identifier is required",
    ...sourceLocationOf(invocation.operator, sourceName),
  };
}
