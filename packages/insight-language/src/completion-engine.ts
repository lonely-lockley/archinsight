import type {
  CompletionItem,
  CompletionRequest,
  CompletionResult,
  CompletionScope,
  InsightSyntaxProvider,
  SyntaxContext,
} from "./contracts.js";
import { CharStream, Token } from "antlr4ng";
import { InsightLexer } from "./generated/InsightLexer.js";
import { lineContextAt, type LineContext } from "./line-context.js";
import { CONTEXT, EDGE, NOTHING, TYPE_SLOT_REFERENCE, TypeSystem } from "./type-system.js";

const PRESENTATION_FIELDS = ["header", "subtitle", "body"];
const PRESENTATION_SECTIONS = ["light", "dark", "graphviz"];
const PRESENTATION_SECTION_PROPERTIES = [
  "fill",
  "stroke",
  "text",
  "bgcolor",
  "shape",
  "style",
  "width",
  "height",
  "rankdir",
  "overlap",
  "newrank",
  "nodesep",
  "ranksep",
  "splines",
  "labelloc",
  "minlen",
  "fontsize",
  "penwidth",
];

export class CompletionEngine {
  constructor(private readonly syntaxProvider: InsightSyntaxProvider) {
  }

  complete(request: CompletionRequest): CompletionResult {
    const offset = Math.max(0, Math.min(request.cursorOffset, request.source.length));
    const originalLine = lineContextAt(request.source, offset);
    const normalized = shouldNormalizeCurrentWord(request.source, offset, originalLine)
      ? sourceWithoutReplacementWord(request.source, originalLine)
      : { source: request.source, cursorOffset: offset };
    const parsed = this.syntaxProvider.parse({
      ...request,
      source: normalized.source,
      cursorOffset: normalized.cursorOffset,
    });
    const line = lineContextAt(normalized.source, normalized.cursorOffset);
    const typeSystem = new TypeSystem(request.snapshot);
    const visibleTypes = new Set([...typeSystem.declaredTypes(), ...parsed.context.visibleTypes]);

    const items = expectsContextReference(parsed.syntax)
      ? contextReferenceItems(parsed.context)
      : parsed.context.mode === "ambiguous"
      ? ambiguousTopLevelItems(line, visibleTypes, typeSystem)
      : parsed.context.mode === "definition"
        ? definitionItems(line, parsed.syntax, visibleTypes, typeSystem)
        : architectureItems(line, parsed.syntax, typeSystem, parsed.context);

    return {
      items: sortAndFilter(items, originalLine.replacementPrefix),
      expectedTokens: parsed.syntax.expectedTokenNames,
      ruleStack: parsed.syntax.ruleStack,
      replacementStartOffset: originalLine.replacementStartOffset,
      replacementEndOffset: originalLine.replacementEndOffset,
    };
  }
}

function sourceWithoutReplacementWord(
  source: string,
  line: LineContext,
): { readonly source: string; readonly cursorOffset: number } {
  if (line.replacementStartOffset === line.replacementEndOffset) {
    return { source, cursorOffset: line.replacementStartOffset };
  }
  return {
    source: source.slice(0, line.replacementStartOffset) + source.slice(line.replacementEndOffset),
    cursorOffset: line.replacementStartOffset,
  };
}

function shouldNormalizeCurrentWord(source: string, offset: number, line: LineContext): boolean {
  if (!line.shouldNormalizeCurrentWord) {
    return false;
  }
  return currentTokenType(source, offset, line.replacementStartOffset, line.replacementEndOffset) !== "TEXT";
}

function ambiguousTopLevelItems(
  line: LineContext,
  visibleTypes: ReadonlySet<string>,
  typeSystem: TypeSystem,
): CompletionItem[] {
  return [keyword("context "), ...definitionItems(line, emptySyntax(), visibleTypes, typeSystem)];
}

function definitionItems(
  line: LineContext,
  syntax: SyntaxContext,
  visibleTypes: ReadonlySet<string>,
  typeSystem: TypeSystem,
): CompletionItem[] {
  if (expectsPresentationName(syntax)) {
    return [...visibleTypes].map((name) => type(`${name} `));
  }
  if (expectsPresentationFieldValue(syntax)) {
    const presentationName = syntax.activePresentationName;
    if (presentationName === undefined) {
      return [];
    }
    return [...typeSystem.attributes(presentationName).keys()]
      .filter((name) => name !== "_")
      .map(identifierItem);
  }
  if (expectsPresentationSectionProperty(line, syntax)) {
    return PRESENTATION_SECTION_PROPERTIES.map((property) => attributeItem(`${property} = `));
  }
  if (expectsPresentationBodyItem(line, syntax)) {
    return [
      ...PRESENTATION_FIELDS.map((field) => attributeItem(`${field} = `)),
      ...PRESENTATION_SECTIONS.map((section) => keyword(`${section}\n${" ".repeat((line.indentLevel + 1) * 4)}`)),
    ];
  }
  if (line.indentLevel > 0 && expectsBodyItem(syntax)) {
    return [
      keyword("constructor "),
      keyword("required "),
      type("List of "),
      type("Text "),
      ...[...visibleTypes].map((name) => type(`${name} `)),
    ];
  }
  if (line.hasOnlyIndentBeforeCursor) {
    return [
      keyword("define type "),
      keyword("define operator "),
      keyword("define enum of "),
      keyword("define presentation "),
      keyword("extend type "),
      keyword("extend enum of "),
      keyword("extend presentation "),
    ];
  }
  if (syntax.previousToken?.type === "DEFINE") {
    return [keyword("type "), keyword("operator "), keyword("enum of "), keyword("presentation ")];
  }
  if (syntax.previousToken?.type === "EXTEND") {
    return [keyword("type "), keyword("enum of "), keyword("presentation ")];
  }
  if (expectsTypeReference(syntax)) {
    return [
      type("List of "),
      type("Text "),
      type("text "),
      ...[...visibleTypes].map((name) => type(`${name} `)),
    ];
  }
  return [];
}

function expectsPresentationName(syntax: SyntaxContext): boolean {
  return rule(syntax, "presentationIdentifier")
    || ((rule(syntax, "definePresentationDeclaration") || rule(syntax, "extendPresentationDeclaration"))
      && syntax.previousToken?.type === "PRESENTATION");
}

function expectsPresentationFieldValue(syntax: SyntaxContext): boolean {
  return (rule(syntax, "textValue") || syntax.previousToken?.type === "EQ")
    && PRESENTATION_FIELDS.includes(syntax.activeAssignmentName ?? "")
    && syntax.activePresentationName !== undefined;
}

function expectsPresentationBodyItem(line: LineContext, syntax: SyntaxContext): boolean {
  return line.indentLevel > 0
    && (rule(syntax, "presentationBodyItem")
      || rule(syntax, "definePresentationDeclaration")
      || rule(syntax, "extendPresentationDeclaration")
      || token(syntax, "TEXT_TYPE")
      || token(syntax, "TYPE")
      || token(syntax, "OPERATOR")
      || token(syntax, "ENUM")
      || token(syntax, "CONTEXT"));
}

function expectsPresentationSectionProperty(line: LineContext, syntax: SyntaxContext): boolean {
  return line.indentLevel > 1
    && (rule(syntax, "presentationSection")
      || rule(syntax, "presentationAssignment")
      || rule(syntax, "presentationPropertyIdentifier"));
}

function architectureItems(
  line: LineContext,
  syntax: SyntaxContext,
  typeSystem: TypeSystem,
  context: CompletionScope,
): CompletionItem[] {
  const edgeList = currentEdgeList(typeSystem, context, line.indentLevel);
  if (!line.hasOnlyIndentBeforeCursor
    && currentOperator(context, line.indentLevel) === undefined
    && isOperatorTargetPosition(syntax)) {
    const operator = context.currentOperatorSpelling
      ?? (syntax.previousToken?.type === "OPERATOR_IDENTIFIER" ? syntax.previousToken.text : undefined);
    if (edgeList === undefined || operator === undefined || !operatorAllowedInEdgeList(typeSystem, edgeList, operator)) {
      return [];
    }
    return [...context.visibleIdentifiers.values()]
      .filter((identifier) => identifier.type === undefined
        || typeSystem.operatorConstructor(operator, edgeList.ownerType, identifier.type) !== undefined)
      .map(identifierItem);
  }
  if (syntax.lineBreakIndentDelta !== undefined) {
    return [newline(line.indentLevel + syntax.lineBreakIndentDelta)];
  }
  if (expectsExtensionConstructor(syntax)) {
    return currentExpectedElementType(typeSystem, context, line.indentLevel)
      .flatMap((expectedType) => typeSystem.constructorsForExpectedType(expectedType))
      .map((constructor) => constructorItem(`${constructor.spelling} `));
  }
  if (expectsExtensionTargetReference(syntax)) {
    const spelling = syntax.activeExtensionConstructor ?? syntax.previousToken?.text;
    const expectedType = spelling === undefined
      ? undefined
      : typeSystem.findConstructor(spelling, parentType(context, line.indentLevel))?.ownerType;
    if (expectedType === undefined) {
      return [];
    }
    return [...context.visibleIdentifiers.values()]
      .filter((identifier) => identifier.type !== undefined && typeSystem.isAssignable(identifier.type, expectedType))
      .map(identifierItem);
  }
  if (expectsContextReference(syntax)) {
    return [...context.visibleContexts].map(identifierItem);
  }
  const typeSlotTargetItems = currentTypeSlotOperatorTargetItems(typeSystem, context, line, syntax);
  if (typeSlotTargetItems !== undefined) {
    return typeSlotTargetItems;
  }
  if (expectsIdentifierDeclaration(syntax, typeSystem, context, line)) {
    return [];
  }
  if (rule(syntax, "annotation") || rule(syntax, "annotationName")) {
    return annotationItems();
  }
  if (isAssignmentValuePosition(syntax)) {
    return [];
  }
  if (currentOperator(context, line.indentLevel) === undefined && edgeList !== undefined) {
    const operators = typeSystem.operatorConstructorsFrom(edgeList.ownerType)
      .filter((operator) => typeSystem.isAssignable(operator.ownerType, edgeList.expectedType))
      .map((operator) => operatorItem(`${operator.spelling} `));
    return line.hasOnlyIndentBeforeCursor
      ? [...annotationItems(), ...operators]
      : operators;
  }
  if (expectsIdentifier(syntax) || line.hasOnlyIndentBeforeCursor) {
    return identifierPositionItems(line, typeSystem, context);
  }
  return [];
}

function identifierPositionItems(
  line: LineContext,
  typeSystem: TypeSystem,
  context: CompletionScope,
): CompletionItem[] {
  const result: CompletionItem[] = [];
  const implicitObjectType = currentImplicitObjectBodyType(typeSystem, context, line.indentLevel);
  const slotReferenceItems = currentSlotReferenceItems(typeSystem, context, line.indentLevel);
  const implicitObjectTypeSlotOperatorItems = implicitObjectType === undefined
    ? []
    : typeSlotOperatorItems(typeSystem, implicitObjectType);
  if (slotReferenceItems.length > 0 && (implicitObjectType === undefined || implicitObjectTypeSlotOperatorItems.length === 0)) {
    return slotReferenceItems;
  }
  result.push(...slotReferenceItems);
  const currentOwnerType = implicitObjectType ?? ownerType(context, line.indentLevel);
  if (line.indentLevel > 0) {
    const assigned = implicitObjectType === undefined
      ? assignedAttributes(context, line.indentLevel)
      : new Set<string>();
    for (const attribute of typeSystem.attributes(currentOwnerType).values()) {
      if (attribute.name !== "_" && !assigned.has(attribute.name)) {
        result.push(attributeItem(typeSystem.isNestedAttribute(attribute) ? `${attribute.name}:` : `${attribute.name} = `));
      }
    }
    result.push(...(implicitObjectType === currentOwnerType
      ? implicitObjectTypeSlotOperatorItems
      : typeSlotOperatorItems(typeSystem, currentOwnerType)));
  }
  const expectedElementTypes = currentExpectedElementType(typeSystem, context, line.indentLevel);
  const prefixOperators = prefixOperatorItems(typeSystem, currentOwnerType, expectedElementTypes);
  const extensionConstructors = expectedElementTypes.flatMap((expectedType) => typeSystem.constructorsForExpectedType(expectedType));
  if (line.hasOnlyIndentBeforeCursor && (prefixOperators.length > 0 || extensionConstructors.length > 0)) {
    result.push(...annotationItems());
  }
  result.push(...prefixOperators);
  if (extensionConstructors.length > 0) {
    result.push(keyword("extend "));
  }
  for (const constructor of extensionConstructors) {
    result.push(constructorItem(`${constructor.spelling} `));
  }
  if (line.indentLevel === 0 && context.contextId !== undefined) {
    result.push(keyword("import "));
  }
  if (line.indentLevel === 0 && context.contextId === undefined) {
    result.push(keyword("context "));
  }
  return result;
}

function currentTypeSlotOperatorTargetItems(
  typeSystem: TypeSystem,
  context: CompletionScope,
  line: LineContext,
  syntax: SyntaxContext,
): CompletionItem[] | undefined {
  if (!(rule(syntax, "identifierDeclaration") || rule(syntax, "listValue")) || syntax.previousToken?.text === undefined) {
    return undefined;
  }
  const owner = currentCompletionOwnerType(typeSystem, context, line.indentLevel);
  const operators = typeSlotOperatorsForOwner(typeSystem, owner)
    .filter((operator) => operator.spelling === syntax.previousToken?.text);
  if (operators.length === 0) {
    return undefined;
  }
  return operators.flatMap((operator) => directReferenceTypeSlotOperator(typeSystem, operator)
    ? visibleIdentifierItemsForType(typeSystem, context, operator.targetType)
    : slotAttributeItemsForType(typeSystem, operator.targetType));
}

function contextReferenceItems(context: CompletionScope): CompletionItem[] {
  return [...context.visibleContexts].map(identifierItem);
}

function expectsTypeReference(syntax: SyntaxContext): boolean {
  return rule(syntax, "typeReference")
    || rule(syntax, "typeUnion")
    || rule(syntax, "typeIdentifier")
    || rule(syntax, "scalarType")
    || ["OF", "ON", "OR", "REQUIRED"].includes(syntax.previousToken?.type ?? "");
}

function isAssignmentValuePosition(syntax: SyntaxContext): boolean {
  return rule(syntax, "textValue")
    || rule(syntax, "assignment")
    || (syntax.activeAssignmentName !== undefined && syntax.previousToken?.type === "EQ");
}

function expectsBodyItem(syntax: SyntaxContext): boolean {
  return rule(syntax, "typeBodyItem")
    || rule(syntax, "operatorBodyItem")
    || rule(syntax, "defineTypeDeclaration")
    || rule(syntax, "defineOperatorDeclaration")
    || rule(syntax, "extendTypeDeclaration")
    || token(syntax, "CONSTRUCTOR")
    || token(syntax, "REQUIRED")
    || token(syntax, "TYPE_IDENTIFIER")
    || token(syntax, "LIST_TYPE");
}

function expectsIdentifier(syntax: SyntaxContext): boolean {
  return token(syntax, "IDENTIFIER")
    || rule(syntax, "architectureFile")
    || rule(syntax, "architectureBodyItem")
    || rule(syntax, "objectBody")
    || rule(syntax, "namedList")
    || rule(syntax, "objectDeclaration")
    || rule(syntax, "insight");
}

function expectsContextReference(syntax: SyntaxContext): boolean {
  return rule(syntax, "contextReference")
    || (rule(syntax, "namedImportDeclaration") && syntax.previousToken?.type === "CONTEXT")
    || (rule(syntax, "anonymousImportDeclaration") && syntax.previousToken?.type === "CONTEXT")
    || (syntax.previousToken?.type === "CONTEXT" && syntax.previousPreviousToken?.type === "FROM");
}

function expectsExtensionConstructor(syntax: SyntaxContext): boolean {
  return rule(syntax, "extensionConstructor")
    || (rule(syntax, "objectExtension") && token(syntax, "CONTEXT"));
}

function expectsExtensionTargetReference(syntax: SyntaxContext): boolean {
  return rule(syntax, "extensionTargetReference")
    || (rule(syntax, "objectExtension") && token(syntax, "IDENTIFIER"));
}

function expectsIdentifierDeclaration(
  syntax: SyntaxContext,
  typeSystem: TypeSystem,
  context: CompletionScope,
  line: LineContext,
): boolean {
  if (rule(syntax, "identifierReference")
    || rule(syntax, "contextReference")
    || rule(syntax, "importAlias")
    || rule(syntax, "extensionTargetReference")
    || expectsContextReference(syntax)) {
    return false;
  }
  return rule(syntax, "contextDeclarationName")
    || rule(syntax, "identifierDeclaration")
    || syntax.previousToken?.type === "CONTEXT"
    || (syntax.previousToken !== undefined
      && previousTypeConstructor(syntax, typeSystem, parentType(context, line.indentLevel)) !== undefined);
}

function previousTypeConstructor(
  syntax: SyntaxContext,
  typeSystem: TypeSystem,
  parent: string,
) {
  const spelling = syntax.previousToken?.text;
  return spelling === undefined
    ? undefined
    : typeSystem.findConstructor(spelling, parent) ?? typeSystem.findConstructor(spelling, NOTHING);
}

function isOperatorTargetPosition(syntax: SyntaxContext): boolean {
  return rule(syntax, "identifierReference")
    || rule(syntax, "operatorInvocation")
    || (syntax.previousToken?.type === "OPERATOR_IDENTIFIER" && syntax.expectedTokenNames.has("IDENTIFIER"));
}

function currentExpectedElementType(
  typeSystem: TypeSystem,
  context: CompletionScope,
  indent: number,
): readonly string[] {
  const list = currentList(context, indent);
  if (list !== undefined) {
    const attribute = typeSystem.attribute(list.ownerType, list.attribute);
    const nestedElementType = attribute === undefined ? undefined : typeSystem.nestedElementType(attribute);
    if (nestedElementType !== undefined) {
      return [nestedElementType];
    }
  }
  const anonymous = typeSystem.anonymousListAttribute(parentType(context, indent));
  return anonymous?.listElementType === undefined ? [] : [anonymous.listElementType];
}

function currentNamedSlotExpectedType(
  typeSystem: TypeSystem,
  context: CompletionScope,
  indent: number,
): string | undefined {
  const list = currentList(context, indent);
  if (list === undefined) {
    return undefined;
  }
  const attribute = typeSystem.attribute(list.ownerType, list.attribute);
  return attribute === undefined ? undefined : typeSystem.nestedElementType(attribute);
}

function currentImplicitObjectBodyType(
  typeSystem: TypeSystem,
  context: CompletionScope,
  indent: number,
): string | undefined {
  const list = currentList(context, indent);
  if (list === undefined) {
    return undefined;
  }
  const attribute = typeSystem.attribute(list.ownerType, list.attribute);
  return attribute !== undefined && typeSystem.isObjectAttribute(attribute)
    ? attribute.type
    : undefined;
}

function currentCompletionOwnerType(
  typeSystem: TypeSystem,
  context: CompletionScope,
  indent: number,
): string {
  return currentImplicitObjectBodyType(typeSystem, context, indent) ?? ownerType(context, indent);
}

function typeSlotOperatorItems(typeSystem: TypeSystem, owner: string): CompletionItem[] {
  return typeSlotOperatorsForOwner(typeSystem, owner)
    .map((operator) => operatorItem(`${operator.spelling} `));
}

function prefixOperatorItems(
  typeSystem: TypeSystem,
  owner: string,
  expectedElementTypes: readonly string[],
): CompletionItem[] {
  if (expectedElementTypes.length === 0) {
    return [];
  }
  return typeSystem.operatorConstructorsFrom(owner)
    .filter((operator) => !typeSystem.isAssignable(operator.ownerType, TYPE_SLOT_REFERENCE))
    .filter((operator) => expectedElementTypes.some((expectedType) => typeSystem.isAssignable(operator.targetType, expectedType)))
    .map((operator) => operatorItem(`${operator.spelling} `));
}

function typeSlotOperatorsForOwner(typeSystem: TypeSystem, owner: string) {
  return typeSystem.operatorConstructorsFrom(owner)
    .filter((operator) => typeSystem.isAssignable(operator.ownerType, TYPE_SLOT_REFERENCE));
}

function directReferenceTypeSlotOperator(
  typeSystem: TypeSystem,
  operator: { readonly ownerType: string; readonly targetType: string },
): boolean {
  const referenceAttributes = [...typeSystem.attributes(operator.ownerType).values()]
    .filter((attribute) => attribute.list !== true)
    .filter((attribute) => {
      const valueType = referenceAttributeValueType(attribute);
      return valueType !== undefined
        && (typeSystem.isAssignable(valueType, operator.targetType) || typeSystem.isAssignable(operator.targetType, valueType));
    });
  return referenceAttributes.length === 1;
}

function visibleIdentifierItemsForType(
  typeSystem: TypeSystem,
  context: CompletionScope,
  targetType: string,
): CompletionItem[] {
  return [...context.visibleIdentifiers.values()]
    .filter((identifier) => identifier.type !== undefined && typeSystem.isAssignable(identifier.type ?? NOTHING, targetType))
    .map(identifierItem);
}

function slotAttributeItemsForType(
  typeSystem: TypeSystem,
  targetType: string,
): CompletionItem[] {
  return [...typeSystem.attributes(targetType).values()]
    .filter((attribute) => attribute.name !== "_")
    .filter((attribute) => {
      const valueType = referenceAttributeValueType(attribute);
      return valueType !== undefined
        && valueType !== "Text"
        && valueType !== "text"
        && typeSystem.enumValues(valueType).length === 0;
    })
    .map((attribute) => attributeItem(attribute.name));
}

function referenceAttributeValueType(attribute: { readonly type: string; readonly list?: boolean; readonly listElementType?: string }): string | undefined {
  return attribute.list === true ? attribute.listElementType ?? attribute.type : attribute.type;
}

function currentSlotReferenceItems(
  typeSystem: TypeSystem,
  context: CompletionScope,
  indent: number,
): CompletionItem[] {
  const expectedType = currentNamedSlotExpectedType(typeSystem, context, indent);
  if (expectedType === undefined) {
    return [];
  }
  return [
    ...typeSystem.enumValues(expectedType).map(enumValue),
    ...[...context.visibleIdentifiers.values()]
      .filter((identifier) => identifier.type !== undefined && typeSystem.isAssignable(identifier.type, expectedType))
      .map(identifierItem),
    ...typeSystem.constructorsForExpectedType(expectedType)
      .map((constructor) => constructorItem(`${constructor.spelling} `)),
  ];
}

function currentEdgeList(
  typeSystem: TypeSystem,
  context: CompletionScope,
  indent: number,
): { readonly ownerType: string; readonly expectedType: string } | undefined {
  if (currentOperator(context, indent) !== undefined) {
    return undefined;
  }
  const list = currentList(context, indent);
  if (list === undefined) {
    return undefined;
  }
  const expectedType = typeSystem.attribute(list.ownerType, list.attribute)?.listElementType;
  return expectedType !== undefined && typeSystem.isAssignable(expectedType, EDGE)
    ? { ownerType: list.ownerType, expectedType }
    : undefined;
}

function operatorAllowedInEdgeList(
  typeSystem: TypeSystem,
  edgeList: { readonly ownerType: string; readonly expectedType: string },
  operator: string,
): boolean {
  return typeSystem.operatorConstructorsFrom(edgeList.ownerType)
    .filter((constructor) => constructor.spelling === operator)
    .some((constructor) => typeSystem.isAssignable(constructor.ownerType, edgeList.expectedType));
}

function ownerType(context: CompletionScope, indent: number): string {
  return nearestFrame(context, indent)?.frame.type ?? CONTEXT;
}

function parentType(context: CompletionScope, indent: number): string {
  return ownerType(context, indent);
}

function currentList(context: CompletionScope, indent: number) {
  const nearestFrameIndent = Math.max(
    -1,
    ...context.frames.filter((frame) => frame.indent < indent).map((frame) => frame.indent),
    ...context.operatorFrames.filter((frame) => frame.indent < indent).map((frame) => frame.indent),
  );
  return context.lists.find((list) => list.indent < indent && list.indent > nearestFrameIndent);
}

function currentOperator(context: CompletionScope, indent: number): string | undefined {
  const frame = nearestFrame(context, indent);
  return frame?.kind === "operator" ? frame.frame.type : undefined;
}

function assignedAttributes(context: CompletionScope, indent: number): ReadonlySet<string> {
  return nearestFrame(context, indent)?.frame.assignedAttributes ?? new Set<string>();
}

function nearestFrame(
  context: CompletionScope,
  indent: number,
): { readonly kind: "element" | "operator"; readonly frame: { readonly indent: number; readonly type: string; readonly assignedAttributes: ReadonlySet<string> } } | undefined {
  return [
    ...context.frames.map((frame) => ({ kind: "element" as const, frame })),
    ...context.operatorFrames.map((frame) => ({ kind: "operator" as const, frame })),
  ]
    .filter((candidate) => candidate.frame.indent < indent)
    .sort((left, right) => right.frame.indent - left.frame.indent || frameKindRank(right.kind) - frameKindRank(left.kind))[0];
}

function frameKindRank(kind: "element" | "operator"): number {
  return kind === "operator" ? 1 : 0;
}

function sortAndFilter(items: readonly CompletionItem[], replacementPrefix: string): CompletionItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (!(replacementPrefix.length === 0
        || item.insertText.startsWith(replacementPrefix)
        || item.label.startsWith(replacementPrefix))) {
        return false;
      }
      if (seen.has(item.insertText)) {
        return false;
      }
      seen.add(item.insertText);
      return true;
    })
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
}

function rule(syntax: SyntaxContext, name: string): boolean {
  return syntax.ruleStack.includes(name);
}

function token(syntax: SyntaxContext, name: string): boolean {
  return syntax.expectedTokenNames.has(name);
}

function emptySyntax(): SyntaxContext {
  return { expectedTokenNames: new Set(), ruleStack: [] };
}

function keyword(text: string): CompletionItem {
  return { label: text.trimEnd(), insertText: text, kind: "KEYWORD" };
}

function type(text: string): CompletionItem {
  return { label: text.trimEnd(), insertText: text, kind: "TYPE" };
}

function constructorItem(text: string): CompletionItem {
  return { label: text.trimEnd(), insertText: text, kind: "CONSTRUCTOR" };
}

function operatorItem(text: string): CompletionItem {
  return { label: text.trimEnd(), insertText: text, kind: "OPERATOR" };
}

function attributeItem(text: string): CompletionItem {
  const separator = text.indexOf(":") >= 0 ? text.indexOf(":") : text.indexOf("=");
  const label = separator < 0 ? text.trimEnd() : text.slice(0, separator).trimEnd();
  return { label, insertText: text, kind: "ATTRIBUTE" };
}

function identifierItem(identifier: string | { readonly label: string; readonly imported?: boolean }): CompletionItem {
  const label = typeof identifier === "string" ? identifier : identifier.label;
  return {
    label,
    insertText: label,
    kind: "IDENTIFIER",
    ...(typeof identifier !== "string" && identifier.imported === true ? { imported: true } : {}),
  };
}

function enumValue(text: string): CompletionItem {
  return { label: text, insertText: text, kind: "ENUM_VALUE" };
}

function annotation(text: string): CompletionItem {
  return { label: text, insertText: text, kind: "ANNOTATION" };
}

function annotationItems(): CompletionItem[] {
  return [annotation("@planned"), annotation("@deprecated")];
}

function newline(indentLevel: number): CompletionItem {
  return { label: "\\n", insertText: `\n${" ".repeat(indentLevel * 4)}`, kind: "NEWLINE" };
}

function currentTokenType(
  source: string,
  cursorOffset: number,
  replacementStartOffset: number,
  replacementEndOffset: number,
): string | undefined {
  const lexer = new InsightLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  while (true) {
    const token = lexer.nextToken();
    if (token.type === Token.EOF) {
      return undefined;
    }
    if (token.start < 0 || token.stop < 0 || isTechnicalTokenType(token.type)) {
      continue;
    }
    const tokenStart = token.start;
    const tokenEnd = token.stop + 1;
    if (tokenStart < replacementEndOffset
      && replacementStartOffset < tokenEnd
      && tokenStart <= cursorOffset
      && cursorOffset < tokenEnd) {
      return InsightLexer.symbolicNames[token.type] ?? String(token.type);
    }
  }
}

function isTechnicalTokenType(type: number): boolean {
  const name = InsightLexer.symbolicNames[type];
  return name === "EOL"
    || name === "INDENT"
    || name === "DEDENT"
    || name === "WRAP"
    || name === "UNWRAP"
    || name === "WHITESPACE"
    || name === "VALUE_EOL";
}
