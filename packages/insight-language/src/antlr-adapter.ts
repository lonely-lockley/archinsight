import type {
  CompletionRequest,
  CompletionScope,
  ElementFrame,
  InsightSyntaxProvider,
  ListFrame,
  ParsedInsightFile,
  SyntaxContext,
  TokenInfo,
  VisibleIdentifier,
} from "./contracts.js";
import {
  aggregateGroupAttribute,
  isDocumentAggregateMember,
  resolveDocumentAggregateRoot,
} from "./document-aggregate.js";
import {
  childrenOf,
  directChildrenByRule,
  firstChildByRule,
  firstDescendantByRule,
  firstTokenTextByName,
  ruleName,
  startToken,
  stopToken,
  terminalSymbol,
  textOf,
  tokenColumn,
  tokenIndex,
  tokenLine,
  tokenName,
  tokenStart,
  tokenStop,
  tokenText,
  tokenType,
  type AntlrParseFailureLike,
  type AntlrParseTreeLike,
  type AntlrSyntaxErrorLike,
  type AntlrTokenLike,
  type TokenNameResolver,
} from "./parser-facade.js";
import { CONTEXT, NOTHING, TypeSystem } from "./type-system.js";
import { ATTRIBUTE_CAPABILITIES, OPERATOR_CAPABILITIES, TYPE_CAPABILITIES } from "./semantic-capabilities.js";

export interface AntlrAdapterInput {
  readonly source: string;
  readonly cursorOffset: number;
  readonly tree?: AntlrParseTreeLike;
  readonly tokens: readonly AntlrTokenLike[];
  readonly ruleNames: readonly string[];
  readonly tokenName: TokenNameResolver;
  readonly syntaxErrors?: readonly AntlrSyntaxErrorLike[];
  readonly parseFailure?: AntlrParseFailureLike;
  readonly indexedIdentifiers?: ReadonlyMap<string, VisibleIdentifier>;
  readonly contextIds?: readonly string[];
}

export type AntlrParseFunction = (request: CompletionRequest) => AntlrAdapterInput;

export class AntlrInsightSyntaxProvider implements InsightSyntaxProvider {
  constructor(private readonly parseWithAntlr: AntlrParseFunction) {
  }

  parse(request: CompletionRequest): ParsedInsightFile {
    return createParsedInsightFile(this.parseWithAntlr(request), request);
  }
}

export function createParsedInsightFile(
  input: AntlrAdapterInput,
  request: Pick<CompletionRequest, "snapshot">,
): ParsedInsightFile {
  const offset = Math.max(0, Math.min(input.cursorOffset, input.source.length));
  const position = cursorPosition(input.source, offset);
  const syntax = createSyntaxContext(input, offset, position);
  return {
    syntax,
    context: createCompletionScope(input, syntax, offset, position, request.snapshot),
  };
}

export function createSyntaxContext(
  input: AntlrAdapterInput,
  cursorOffset = input.cursorOffset,
  cursor = cursorPosition(input.source, cursorOffset),
): SyntaxContext {
  const ruleStack = input.tree === undefined
    ? []
    : collectRulePath(input.tree, input.ruleNames, cursorOffset, cursor).reverse();
  const previous = previousToken(input.tokens, input.tokenName, cursorOffset);
  const previousPrevious = previousTokenBefore(input.tokens, input.tokenName, previous);
  const expectedTokenNames = new Set<string>();
  for (const type of expectedTokenTypesAtCursor(input.syntaxErrors ?? [], cursorOffset, cursor)) {
    expectedTokenNames.add(tokenName(input.tokenName, type));
  }
  let lineBreakIndentDelta: number | undefined;
  if (expectedTokenNames.has("EOL")) {
    lineBreakIndentDelta = expectedTokenNames.has("INDENT") ? 1 : 0;
  } else {
    lineBreakIndentDelta = missingLineBreakIndentDelta(input.tree, previous);
    if (lineBreakIndentDelta !== undefined) {
      expectedTokenNames.add("EOL");
    }
  }
  const visibleExpectedTokenNames = new Set(
    [...expectedTokenNames].filter((name) => !isTechnicalExpectedToken(name)),
  );
  return {
    expectedTokenNames: visibleExpectedTokenNames,
    ruleStack,
    ...(previous === undefined ? {} : { previousToken: previous }),
    ...(previousPrevious === undefined ? {} : { previousPreviousToken: previousPrevious }),
    ...(lineBreakIndentDelta === undefined ? {} : { lineBreakIndentDelta }),
    ...optionalProperty(
      "activeAssignmentName",
      input.tree === undefined
        ? activeAssignmentName(input.tokens, input.tokenName, cursorOffset)
        : activeChildText(input.tree, "assignment", "attributeName", input.ruleNames, cursorOffset, cursor)
        ?? activeChildText(input.tree, "presentationAssignment", "presentationPropertyIdentifier", input.ruleNames, cursorOffset, cursor)
        ?? activeAssignmentName(input.tokens, input.tokenName, cursorOffset),
    ),
    ...optionalProperty(
      "activePresentationName",
      input.tree === undefined
        ? activePresentationName(input.tokens, input.tokenName, cursorOffset)
        : activeChildText(
          input.tree,
          "definePresentationDeclaration",
          "presentationIdentifier",
          input.ruleNames,
          cursorOffset,
          cursor,
        )
        ?? activeChildText(
          input.tree,
          "extendPresentationDeclaration",
          "presentationIdentifier",
          input.ruleNames,
          cursorOffset,
          cursor,
        )
        ?? activePresentationName(input.tokens, input.tokenName, cursorOffset),
    ),
    ...optionalProperty(
      "activeExtensionConstructor",
      input.tree === undefined
        ? undefined
        : activeChildText(
          input.tree,
          "objectExtension",
          "extensionConstructor",
          input.ruleNames,
          cursorOffset,
          cursor,
        ),
    ),
    ...optionalProperty(
      "activeDefinitionTypeName",
      input.tree === undefined
        ? undefined
        : activeChildText(
          input.tree,
          "defineTypeDeclaration",
          "typeIdentifier",
          input.ruleNames,
          cursorOffset,
          cursor,
        )
        ?? activeChildText(
          input.tree,
          "defineOperatorDeclaration",
          "typeIdentifier",
          input.ruleNames,
          cursorOffset,
          cursor,
        ),
    ),
  };
}

function isTechnicalExpectedToken(name: string): boolean {
  return name === "EOF"
    || name === "EOL"
    || name === "INDENT"
    || name === "DEDENT"
    || name === "WRAP"
    || name === "UNWRAP"
    || name === "WHITESPACE"
    || name === "VALUE_EOL";
}

function createCompletionScope(
  input: AntlrAdapterInput,
  syntax: SyntaxContext,
  cursorOffset: number,
  cursor: CursorPosition,
  snapshot: CompletionRequest["snapshot"],
): CompletionScope {
  const typeSystem = new TypeSystem(snapshot);
  const visibleIdentifiers = new Map(input.indexedIdentifiers ?? []);
  const visibleContexts = new Set(input.contextIds ?? []);
  const visibleTypes = new Set<string>();
  collectImportAliases(input.tokens, input.tokenName, visibleIdentifiers);
  collectElementDeclarations(input.tokens, input.tokenName, typeSystem, visibleIdentifiers);
  collectContextDeclarations(input.tokens, input.tokenName, visibleContexts);
  collectTypeDeclarations(input.tokens, input.tokenName, visibleTypes);

  const state: FileContextState = {
    contextId: undefined,
    visibleIdentifiers,
    frames: [],
    operatorFrames: [],
    lists: [],
    currentOperatorSpelling: undefined,
    tokenName: input.tokenName,
  };
  const architecture = input.tree === undefined
    ? undefined
    : firstDescendantByRule(input.tree, "architectureFile", input.ruleNames);
  if (architecture !== undefined) {
    const contextDeclaration = firstChildByRule(architecture, "contextDeclaration", input.ruleNames);
    const environmentFile = firstChildByRule(architecture, "environmentFile", input.ruleNames);
    const environmentDeclaration = environmentFile === undefined
      ? undefined
      : firstChildByRule(environmentFile, "environmentDeclaration", input.ruleNames);
    const contextName = contextDeclaration === undefined
      ? undefined
      : firstChildByRule(contextDeclaration, "contextDeclarationName", input.ruleNames);
    if (contextName !== undefined && startsBefore(contextName, cursorOffset)) {
      state.contextId = textOf(contextName);
    }
    const environmentName = environmentDeclaration === undefined
      ? undefined
      : firstChildByRule(environmentDeclaration, "environmentDeclarationName", input.ruleNames);
    if (contextName === undefined && environmentName !== undefined && startsBefore(environmentName, cursorOffset)) {
      state.contextId = textOf(environmentName);
    }
    let environmentFrame: MutableElementFrame | undefined;
    let documentAggregateType: string | undefined;
    if (environmentDeclaration !== undefined && startsBefore(environmentDeclaration, cursorOffset)) {
      documentAggregateType = completionDocumentAggregateType(
        typeSystem,
        environmentDeclaration,
        environmentFile,
        input.ruleNames,
      );
      const environmentType = documentAggregateType;
      if (environmentName !== undefined && environmentType !== undefined) {
        state.visibleIdentifiers.set(textOf(environmentName), {
          label: textOf(environmentName),
          type: environmentType,
          imported: false,
        });
      }
      if ((contains(environmentDeclaration, cursorOffset, cursor)
        || (environmentFile !== undefined && contains(environmentFile, cursorOffset, cursor)))
        && environmentType !== undefined) {
        environmentFrame = mutableFrame(indentLevel(environmentDeclaration), environmentType);
        state.frames.unshift(environmentFrame);
        const environmentBody = firstChildByRule(environmentDeclaration, "objectBody", input.ruleNames);
        if (environmentBody !== undefined) {
          processBody(environmentBody, environmentType, undefined, cursorOffset, cursor, typeSystem, state, input.ruleNames, environmentFrame);
        }
      }
    }
    for (const item of directChildrenByRule(architecture, "architectureTopLevelItem", input.ruleNames)) {
      processArchitectureItem(item, CONTEXT, undefined, cursorOffset, cursor, typeSystem, state, input.ruleNames);
    }
    if (environmentFile !== undefined) {
      const environmentType = environmentFrame?.type ?? documentAggregateType;
      for (const item of directChildrenByRule(environmentFile, "architectureTopLevelItem", input.ruleNames)) {
        processArchitectureItem(
          item,
          environmentType ?? CONTEXT,
          undefined,
          cursorOffset,
          cursor,
          typeSystem,
          state,
          input.ruleNames,
          environmentFrame,
        );
      }
    }
    const contextBody = contextDeclaration === undefined
      ? undefined
      : firstChildByRule(contextDeclaration, "objectBody", input.ruleNames);
    if (contextBody !== undefined) {
      processBody(contextBody, CONTEXT, undefined, cursorOffset, cursor, typeSystem, state, input.ruleNames, undefined);
    }
  } else {
    processLineFallbackScope(input.source, cursorOffset, typeSystem, state);
  }

  return {
    mode: inferCompletionMode(syntax, input.tree, input.ruleNames, state),
    ...(state.contextId === undefined ? {} : { contextId: state.contextId }),
    visibleContexts,
    visibleTypes,
    visibleIdentifiers,
    frames: state.frames,
    operatorFrames: state.operatorFrames,
    lists: state.lists,
    ...(state.currentOperatorSpelling === undefined
      ? {}
      : { currentOperatorSpelling: state.currentOperatorSpelling }),
  };
}

function processLineFallbackScope(
  source: string,
  cursorOffset: number,
  typeSystem: TypeSystem,
  state: FileContextState,
): void {
  const cursor = cursorPosition(source, cursorOffset);
  const stack: MutableElementFrame[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < Math.min(cursor.line, lines.length); index++) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    const indent = Math.floor(leadingWhitespaceLength(line) / 4);
    const content = line.trim();
    if (content.length === 0 || content.startsWith("#")) {
      continue;
    }
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }
    const assignment = assignmentNameFromLine(content);
    if (assignment !== undefined) {
      stack[stack.length - 1]?.assignedAttributes.add(assignment);
      continue;
    }
    const declaration = objectDeclarationFromLine(content);
    if (declaration === undefined) {
      continue;
    }
    const parent = stack[stack.length - 1]?.type ?? CONTEXT;
    const resolvedType = typeSystem.findConstructor(declaration.constructor, parent)?.ownerType
      ?? typeSystem.anonymousListAttribute(parent)?.listElementType;
    if (resolvedType === undefined) {
      continue;
    }
    if (declaration.constructor === "context") {
      state.contextId = declaration.identifier;
    }
    const frame = mutableFrame(indent, resolvedType, undefined, parent);
    stack.push(frame);
    state.visibleIdentifiers.set(declaration.identifier, { label: declaration.identifier, type: resolvedType, imported: false });
  }
  for (const frame of stack) {
    state.frames.unshift(frame);
  }
}

function completionDocumentAggregateType(
  typeSystem: TypeSystem,
  declaration: AntlrParseTreeLike,
  environmentFile: AntlrParseTreeLike | undefined,
  ruleNames: readonly string[],
): string | undefined {
  const groupNames = completionAggregateGroupNames(declaration, environmentFile, typeSystem, ruleNames);
  return resolveDocumentAggregateRoot(typeSystem, groupNames)?.type;
}

function completionAggregateGroupNames(
  declaration: AntlrParseTreeLike,
  environmentFile: AntlrParseTreeLike | undefined,
  typeSystem: TypeSystem,
  ruleNames: readonly string[],
): ReadonlySet<string> {
  const result = completionNamedListNames(declaration, ruleNames);
  if (environmentFile !== undefined) {
    for (const item of directChildrenByRule(environmentFile, "architectureTopLevelItem", ruleNames)) {
      const object = firstDescendantByRule(item, "objectDeclaration", ruleNames);
      if (object === undefined) {
        continue;
      }
      const constructorName = firstChildByRule(object, "elementConstructor", ruleNames);
      if (constructorName === undefined || !typeSystem.constructorsForSpelling(textOf(constructorName))
        .some((constructor) => isDocumentAggregateMember(typeSystem, constructor.ownerType))) {
        continue;
      }
      const body = firstChildByRule(object, "objectBody", ruleNames);
      if (body !== undefined) {
        collectNamedListNamesFromBody(body, result, ruleNames);
      }
    }
  }
  return result;
}

function completionNamedListNames(
  declaration: AntlrParseTreeLike,
  ruleNames: readonly string[],
): Set<string> {
  const result = new Set<string>();
  const body = firstChildByRule(declaration, "objectBody", ruleNames);
  if (body !== undefined) {
    collectNamedListNamesFromBody(body, result, ruleNames);
  }
  return result;
}

function collectNamedListNamesFromBody(
  body: AntlrParseTreeLike,
  result: Set<string>,
  ruleNames: readonly string[],
): void {
  for (const item of directChildrenByRule(body, "architectureBodyItem", ruleNames)) {
    const list = firstChildByRule(item, "namedList", ruleNames);
    const name = list === undefined ? undefined : firstChildByRule(list, "listName", ruleNames);
    if (name !== undefined) {
      result.add(textOf(name));
    }
  }
}

function assignmentNameFromLine(content: string): string | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(content);
  return match?.[1];
}

function objectDeclarationFromLine(content: string): { readonly constructor: string; readonly identifier: string } | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*|context|environment)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(content);
  if (match === null) {
    return undefined;
  }
  return { constructor: match[1]!, identifier: match[2]! };
}

function leadingWhitespaceLength(text: string): number {
  let index = 0;
  while (index < text.length && (text[index] === " " || text[index] === "\t")) {
    index++;
  }
  return index;
}

function inferCompletionMode(
  syntax: SyntaxContext,
  tree: AntlrParseTreeLike | undefined,
  ruleNames: readonly string[],
  state: FileContextState,
): CompletionScope["mode"] {
  const mode = inferMode(syntax, tree, ruleNames);
  if (mode !== "ambiguous") {
    return mode;
  }
  return state.contextId !== undefined
    || state.frames.length > 0
    || state.operatorFrames.length > 0
    || state.lists.length > 0
    || syntax.activeAssignmentName !== undefined
    ? "architecture"
    : "ambiguous";
}

function collectContextDeclarations(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  contexts: Set<string>,
): void {
  for (let index = 0; index + 1 < tokens.length; index++) {
    const token = tokens[index];
    const id = tokens[index + 1];
    if (token === undefined || id === undefined
      || !["CONTEXT", "ENVIRONMENT"].includes(tokenName(tokenNameResolver, tokenType(token)))
      || tokenName(tokenNameResolver, tokenType(id)) !== "IDENTIFIER"
      || previousRealTokenName(tokens, tokenNameResolver, index) === "FROM") {
      continue;
    }
    contexts.add(tokenText(id));
  }
}

function collectTypeDeclarations(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  types: Set<string>,
): void {
  const realTokens = tokens.filter((token) => {
    const name = tokenName(tokenNameResolver, tokenType(token));
    return name !== "EOF" && !isTechnicalTokenName(name);
  });
  for (let index = 0; index + 2 < realTokens.length; index++) {
    const define = realTokens[index];
    const kind = realTokens[index + 1];
    const id = realTokens[index + 2];
    if (define === undefined || kind === undefined || id === undefined) {
      continue;
    }
    const kindName = tokenName(tokenNameResolver, tokenType(kind));
    if (tokenName(tokenNameResolver, tokenType(define)) === "DEFINE"
      && (kindName === "TYPE" || kindName === "OPERATOR")
      && tokenName(tokenNameResolver, tokenType(id)) === "TYPE_IDENTIFIER") {
      types.add(tokenText(id));
    }
  }
}

function processBody(
  body: AntlrParseTreeLike,
  ownerType: string,
  expectedListElementType: string | undefined,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
  ownerFrame: MutableElementFrame | undefined,
): void {
  if (!startsBefore(body, cursorOffset)) {
    return;
  }
  for (const item of directChildrenByRule(body, "architectureBodyItem", ruleNames)) {
    processArchitectureItem(
      item,
      ownerType,
      expectedListElementType,
      cursorOffset,
      cursor,
      typeSystem,
      state,
      ruleNames,
      ownerFrame,
    );
  }
}

function processArchitectureItem(
  item: AntlrParseTreeLike,
  ownerType: string,
  expectedListElementType: string | undefined,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
  ownerFrame?: MutableElementFrame,
): void {
  if (!startsBefore(item, cursorOffset)) {
    return;
  }
  const assignment = firstChildByRule(item, "assignment", ruleNames);
  if (assignment !== undefined) {
    const name = firstChildByRule(assignment, "attributeName", ruleNames);
    if (name !== undefined && ownerFrame !== undefined) {
      ownerFrame.assignedAttributes.add(textOf(name));
    }
    return;
  }
  const list = firstChildByRule(item, "namedList", ruleNames);
  if (list !== undefined) {
    processList(list, ownerType, cursorOffset, cursor, typeSystem, state, ruleNames, ownerFrame);
    return;
  }
  const annotatedObject = firstChildByRule(item, "annotatedObjectDeclaration", ruleNames);
  const objectDeclaration = annotatedObject === undefined
    ? undefined
    : firstChildByRule(annotatedObject, "objectDeclaration", ruleNames);
  if (objectDeclaration !== undefined) {
    if (processDeploymentActionObject(objectDeclaration, ownerType, cursorOffset, cursor, typeSystem, state, ruleNames)) {
      return;
    }
    processElementDeclaration(
      objectDeclaration,
      ownerType,
      expectedListElementType ?? typeSystem.anonymousListAttribute(ownerType)?.listElementType,
      cursorOffset,
      cursor,
      typeSystem,
      state,
      ruleNames,
    );
    return;
  }
  const extension = firstChildByRule(item, "objectExtension", ruleNames);
  if (extension !== undefined) {
    processExtension(extension, cursorOffset, cursor, typeSystem, state, ruleNames);
    return;
  }
  const annotatedOperator = firstChildByRule(item, "annotatedOperatorInvocation", ruleNames);
  const operatorInvocation = annotatedOperator === undefined
    ? undefined
    : firstChildByRule(annotatedOperator, "operatorInvocation", ruleNames);
  if (operatorInvocation !== undefined) {
    processOperator(operatorInvocation, ownerType, cursorOffset, cursor, typeSystem, state, ruleNames);
  }
}

function processDeploymentActionObject(
  declaration: AntlrParseTreeLike,
  ownerType: string,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
): boolean {
  const operatorNode = firstChildByRule(declaration, "namedPrefixOperatorInvocation", ruleNames)
    ?? firstChildByRule(declaration, "elementConstructor", ruleNames);
  const operator = operatorNode === undefined ? undefined : textOf(operatorNode);
  if (operator === undefined || !deploymentOperator(typeSystem, ownerType, operator)) {
    return false;
  }
  const inDeploymentList = state.lists.some((list) =>
    typeSystem.attribute(list.ownerType, list.attribute)?.capabilities
      ?.includes(ATTRIBUTE_CAPABILITIES.deploymentActions) === true
  );
  if (!inDeploymentList && !typeSystem.typeHasCapability(ownerType, TYPE_CAPABILITIES.deploymentProfile)) {
    return false;
  }
  if (contains(declaration, cursorOffset, cursor)) {
    state.currentOperatorSpelling = operator;
  }
  if (!contains(declaration, cursorOffset, cursor)) {
    return true;
  }
  const target = firstChildByRule(declaration, "namedPrefixOperatorInvocation", ruleNames) === undefined
    ? firstChildByRule(declaration, "identifierDeclaration", ruleNames)
    : firstChildByRule(declaration, "elementConstructor", ruleNames);
  const completionTypes = deploymentActionOverrideTypes(operator, target, ownerType, typeSystem, state);
  if (completionTypes.length === 0) {
    return true;
  }
  const frame = mutableFrame(indentLevel(declaration), completionTypes[0]!, completionTypes);
  state.operatorFrames.unshift(frame);
  const body = firstChildByRule(declaration, "objectBody", ruleNames);
  if (body !== undefined) {
    processBody(body, frame.type, undefined, cursorOffset, cursor, typeSystem, state, ruleNames, frame);
  }
  return true;
}

function processList(
  list: AntlrParseTreeLike,
  ownerType: string,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
  ownerFrame?: MutableElementFrame,
): void {
  const listName = firstChildByRule(list, "listName", ruleNames);
  if (listName === undefined) {
    return;
  }
  const attribute = textOf(listName);
  const rootType = ownerFrame?.parentType;
  const aggregateAttribute = aggregateGroupAttribute(typeSystem, rootType, ownerType, attribute);
  const attributeOwnerType = aggregateAttribute === undefined ? ownerType : rootType!;
  const attributeDefinition = typeSystem.attribute(attributeOwnerType, attribute);
  const expectedType = attributeDefinition === undefined ? undefined : typeSystem.nestedElementType(attributeDefinition);
  if ((contains(list, cursorOffset, cursor) || isIndentedUnderListHeader(list, cursor))
    && cursor.line > tokenLine(startToken(list))) {
    state.lists.unshift({ indent: indentLevel(list), ownerType: attributeOwnerType, attribute });
  }
  for (const listItem of directChildrenByRule(list, "listBodyItem", ruleNames)) {
    const item = firstChildByRule(listItem, "architectureBodyItem", ruleNames);
    if (item === undefined) {
      continue;
    }
    processArchitectureItem(
      item,
      ownerType,
      expectedType,
      cursorOffset,
      cursor,
      typeSystem,
      state,
      ruleNames,
      ownerFrame,
    );
  }
}

function isIndentedUnderListHeader(
  list: AntlrParseTreeLike,
  cursor: CursorPosition,
): boolean {
  const start = startToken(list);
  return start !== undefined
    && cursor.line > tokenLine(start)
    && cursor.column > tokenColumn(start);
}

function processElementDeclaration(
  declaration: AntlrParseTreeLike,
  parentType: string,
  expectedListElementType: string | undefined,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
): void {
  if (!startsBefore(declaration, cursorOffset)) {
    return;
  }
  const constructor = firstChildByRule(declaration, "elementConstructor", ruleNames);
  const identifier = firstChildByRule(declaration, "identifierDeclaration", ruleNames);
  const resolvedType = constructor === undefined
    ? undefined
    : typeSystem.findConstructor(textOf(constructor), parentType)?.ownerType ?? expectedListElementType;
  if (identifier !== undefined
    && resolvedType !== undefined
    && firstTokenTextByName(identifier, "ANONYMOUS_ATTRIBUTE", state.tokenName) === undefined) {
    state.visibleIdentifiers.set(textOf(identifier), { label: textOf(identifier), type: resolvedType, imported: false });
  }
  if ((!contains(declaration, cursorOffset, cursor)
    && !isImplicitObjectBodyPosition(declaration, cursor, ruleNames))
    || resolvedType === undefined) {
    return;
  }
  const frame = mutableFrame(indentLevel(declaration), resolvedType, undefined, parentType);
  state.frames.unshift(frame);
  const body = firstChildByRule(declaration, "objectBody", ruleNames);
  if (body !== undefined) {
    processBody(body, resolvedType, undefined, cursorOffset, cursor, typeSystem, state, ruleNames, frame);
  }
}

function isImplicitObjectBodyPosition(
  declaration: AntlrParseTreeLike,
  cursor: CursorPosition,
  ruleNames: readonly string[],
): boolean {
  return firstChildByRule(declaration, "objectBody", ruleNames) === undefined
    && cursor.line > tokenLine(startToken(declaration))
    && cursor.column > tokenColumn(startToken(declaration));
}

function processExtension(
  extension: AntlrParseTreeLike,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
): void {
  if (!startsBefore(extension, cursorOffset)) {
    return;
  }
  const target = firstChildByRule(extension, "extensionTargetReference", ruleNames);
  const constructor = firstChildByRule(extension, "extensionConstructor", ruleNames);
  const targetType = (target === undefined ? undefined : state.visibleIdentifiers.get(textOf(target))?.type)
    ?? (constructor === undefined ? undefined : typeSystem.findConstructor(textOf(constructor))?.ownerType);
  if (!contains(extension, cursorOffset, cursor) || targetType === undefined) {
    return;
  }
  const frame = mutableFrame(indentLevel(extension), targetType);
  state.frames.unshift(frame);
  const body = firstChildByRule(extension, "objectBody", ruleNames);
  if (body !== undefined) {
    processBody(body, targetType, undefined, cursorOffset, cursor, typeSystem, state, ruleNames, frame);
  }
}

function processOperator(
  invocation: AntlrParseTreeLike,
  ownerType: string,
  cursorOffset: number,
  cursor: CursorPosition,
  typeSystem: TypeSystem,
  state: FileContextState,
  ruleNames: readonly string[],
): void {
  if (!startsBefore(invocation, cursorOffset)) {
    return;
  }
  const operatorNode = firstChildByRule(invocation, "operatorIdentifier", ruleNames);
  const operator = operatorNode === undefined ? undefined : textOf(operatorNode);
  if (operator === undefined) {
    return;
  }
  if (contains(invocation, cursorOffset, cursor)) {
    state.currentOperatorSpelling = operator;
  }
  const target = firstChildByRule(invocation, "identifierReference", ruleNames);
  const targetType = target === undefined
    ? ownerType
    : state.visibleIdentifiers.get(textOf(target))?.type ?? ownerType;
  const edgeType = typeSystem.operatorConstructor(operator, ownerType, targetType)?.ownerType;
  const completionTypes = deploymentActionOverrideTypes(operator, target, ownerType, typeSystem, state);
  if (!contains(invocation, cursorOffset, cursor) || (edgeType === undefined && completionTypes.length === 0)) {
    return;
  }
  const frame = mutableFrame(indentLevel(invocation), completionTypes[0] ?? edgeType!, completionTypes);
  state.operatorFrames.unshift(frame);
  const body = firstChildByRule(invocation, "objectBody", ruleNames);
  if (body !== undefined) {
    processBody(body, frame.type, undefined, cursorOffset, cursor, typeSystem, state, ruleNames, frame);
  }
}

function deploymentActionOverrideTypes(
  operator: string,
  target: AntlrParseTreeLike | undefined,
  ownerType: string,
  typeSystem: TypeSystem,
  state: FileContextState,
): readonly string[] {
  if (target === undefined || !deploymentOperator(typeSystem, ownerType, operator)) {
    return [];
  }
  const inDeploymentList = state.lists.some((list) =>
    typeSystem.attribute(list.ownerType, list.attribute)?.capabilities
      ?.includes(ATTRIBUTE_CAPABILITIES.deploymentActions) === true
  );
  if (!inDeploymentList && !typeSystem.typeHasCapability(ownerType, TYPE_CAPABILITIES.deploymentProfile)) {
    return [];
  }
  const targetText = textOf(target);
  const identifierType = state.visibleIdentifiers.get(targetText)?.type;
  if (identifierType !== undefined && typeSystem.typeHasCapability(identifierType, TYPE_CAPABILITIES.infrastructure)) {
    return [identifierType];
  }
  if (identifierType !== undefined) {
    return [];
  }
  return unique(typeSystem.typesWithCapability(TYPE_CAPABILITIES.environment)
    .flatMap((environmentType) => typeSlotAttributeTypes(typeSystem, environmentType, targetText))
    .filter((type) => typeSystem.typeHasCapability(type, TYPE_CAPABILITIES.infrastructure)));
}

function deploymentOperator(typeSystem: TypeSystem, ownerType: string, spelling: string): boolean {
  return typeSystem.operatorConstructorsFrom(ownerType)
    .filter((operator) => operator.spelling === spelling)
    .some((operator) => typeSystem.operatorHasCapability(operator, OPERATOR_CAPABILITIES.deploymentUse)
      || typeSystem.operatorHasCapability(operator, OPERATOR_CAPABILITIES.deploymentPlacement));
}

function typeSlotAttributeTypes(
  typeSystem: TypeSystem,
  ownerBaseType: string,
  attributeName: string,
): readonly string[] {
  return [ownerBaseType, ...typeSystem.descendantTypes(ownerBaseType)]
    .flatMap((type) => {
      const attribute = typeSystem.attribute(type, attributeName);
      const valueType = attribute === undefined ? undefined : referenceAttributeValueType(attribute);
      return valueType === undefined ? [] : [valueType];
    });
}

function referenceAttributeValueType(attribute: { readonly type: string; readonly list?: boolean; readonly listElementType?: string }): string | undefined {
  return attribute.list === true ? attribute.listElementType : attribute.type;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function inferMode(
  syntax: SyntaxContext,
  tree: AntlrParseTreeLike | undefined,
  ruleNames: readonly string[],
): CompletionScope["mode"] {
  if (syntax.ruleStack.some((rule) => DEFINITION_RULES.has(rule))) {
    return "definition";
  }
  if (syntax.ruleStack.includes("architectureFile")
    || (tree !== undefined && firstDescendantByRule(tree, "architectureFile", ruleNames) !== undefined)) {
    return "architecture";
  }
  if (tree !== undefined && firstDescendantByRule(tree, "definitionFile", ruleNames) !== undefined) {
    return "definition";
  }
  return "ambiguous";
}

function collectImportAliases(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  identifiers: Map<string, VisibleIdentifier>,
): void {
  for (let index = 0; index + 4 < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined || tokenName(tokenNameResolver, tokenType(token)) !== "IMPORT") {
      continue;
    }
    const imported = tokens[index + 1];
    const from = tokens[index + 2];
    const context = tokens[index + 3];
    const contextName = tokens[index + 4];
    if (imported === undefined || from === undefined || context === undefined || contextName === undefined
      || tokenName(tokenNameResolver, tokenType(imported)) !== "IDENTIFIER"
      || tokenName(tokenNameResolver, tokenType(from)) !== "FROM"
      || !["CONTEXT", "ENVIRONMENT"].includes(tokenName(tokenNameResolver, tokenType(context)))
      || tokenName(tokenNameResolver, tokenType(contextName)) !== "IDENTIFIER") {
      continue;
    }
    let alias = tokenText(imported);
    const asToken = tokens[index + 5];
    const aliasToken = tokens[index + 6];
    if (asToken !== undefined
      && aliasToken !== undefined
      && tokenName(tokenNameResolver, tokenType(asToken)) === "AS"
      && tokenName(tokenNameResolver, tokenType(aliasToken)) === "IDENTIFIER") {
      alias = tokenText(aliasToken);
    }
    const indexed = identifiers.get(alias);
    identifiers.set(alias, {
      label: alias,
      ...(indexed?.type === undefined ? {} : { type: indexed.type }),
      imported: true,
    });
  }
}

function collectElementDeclarations(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  typeSystem: TypeSystem,
  identifiers: Map<string, VisibleIdentifier>,
): void {
  for (let index = 0; index + 1 < tokens.length; index++) {
    const constructor = tokens[index];
    const id = tokens[index + 1];
    if (constructor === undefined || id === undefined
      || tokenName(tokenNameResolver, tokenType(id)) !== "IDENTIFIER"
      || !["IDENTIFIER", "CONTEXT", "ENVIRONMENT"].includes(tokenName(tokenNameResolver, tokenType(constructor)))
      || previousRealTokenName(tokens, tokenNameResolver, index) === "EXTEND") {
      continue;
    }
    const type = typeSystem.findConstructor(tokenText(constructor), NOTHING)?.ownerType;
    if (type !== undefined && type !== CONTEXT) {
      identifiers.set(tokenText(id), { label: tokenText(id), type, imported: false });
    }
  }
}

function previousRealTokenName(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  index: number,
): string | undefined {
  for (let previous = index - 1; previous >= 0; previous--) {
    const token = tokens[previous];
    if (token !== undefined && tokenName(tokenNameResolver, tokenType(token)) !== "EOF") {
      return tokenName(tokenNameResolver, tokenType(token));
    }
  }
  return undefined;
}

function collectRulePath(
  tree: AntlrParseTreeLike,
  ruleNames: readonly string[],
  cursorOffset: number,
  cursor: CursorPosition,
): string[] {
  if (!isRuleNode(tree) || !contains(tree, cursorOffset, cursor)) {
    return [];
  }
  const path = [ruleName(tree, ruleNames)];
  for (const child of childrenOf(tree)) {
    const childPath = collectRulePath(child, ruleNames, cursorOffset, cursor);
    if (childPath.length > 0) {
      path.push(...childPath);
      break;
    }
  }
  return path;
}

function expectedTokenTypesAtCursor(
  syntaxErrors: readonly AntlrSyntaxErrorLike[],
  cursorOffset: number,
  cursor: CursorPosition,
): Set<number> {
  const result = new Set<number>();
  for (const error of syntaxErrors) {
    if (error.offset === cursorOffset || (error.offset === undefined
      && error.line === cursor.line
      && error.column === cursor.column)) {
      for (const type of error.expectedTokenTypes) {
        result.add(type);
      }
    }
  }
  return result;
}

function missingLineBreakIndentDelta(
  tree: AntlrParseTreeLike | undefined,
  previous: TokenInfo | undefined,
): number | undefined {
  if (tree === undefined || previous === undefined) {
    return undefined;
  }
  const terminals: AntlrTokenLike[] = [];
  collectTerminalTokens(tree, terminals);
  for (let index = 0; index < terminals.length; index++) {
    if (tokenIndex(terminals[index]) !== previous.index) {
      continue;
    }
    return missingLineBreakAfter(terminals, index);
  }
  return undefined;
}

function missingLineBreakAfter(terminals: readonly AntlrTokenLike[], previousIndex: number): number | undefined {
  for (let index = previousIndex + 1; index < terminals.length; index++) {
    const token = terminals[index];
    if (token === undefined || tokenType(token) === -1) {
      return undefined;
    }
    if (!isMissingToken(token)) {
      return undefined;
    }
    if (tokenText(token) === "<missing EOL>" || tokenNameFromText(token) === "EOL") {
      const next = terminals[index + 1];
      return next !== undefined && isMissingToken(next) && tokenNameFromText(next) === "INDENT" ? 1 : 0;
    }
  }
  return undefined;
}

function collectTerminalTokens(tree: AntlrParseTreeLike, result: AntlrTokenLike[]): void {
  const symbol = terminalSymbol(tree);
  if (symbol !== undefined) {
    result.push(symbol);
    return;
  }
  for (const child of childrenOf(tree)) {
    collectTerminalTokens(child, result);
  }
}

function activeChildText(
  tree: AntlrParseTreeLike,
  ownerRule: string,
  childRule: string,
  ruleNames: readonly string[],
  cursorOffset: number,
  cursor: CursorPosition,
): string | undefined {
  if (ruleName(tree, ruleNames) === ownerRule && contains(tree, cursorOffset, cursor)) {
    const child = firstChildByRule(tree, childRule, ruleNames);
    const text = child === undefined ? undefined : textOf(child);
    return text !== undefined && !text.startsWith("<missing ") ? text : undefined;
  }
  for (const child of childrenOf(tree)) {
    const result = activeChildText(child, ownerRule, childRule, ruleNames, cursorOffset, cursor);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

function contains(tree: AntlrParseTreeLike, cursorOffset: number, cursor: CursorPosition): boolean {
  const start = startToken(tree);
  const stop = stopToken(tree);
  if (start === undefined || stop === undefined) {
    return false;
  }
  const startOffset = Math.max(0, tokenStart(start));
  const stopOffset = tokenNameFromText(stop) === "EOF" || tokenType(stop) === -1
    ? cursorOffset + 1
    : Math.max(startOffset, tokenStop(stop) + 1);
  const startsInside = tokenNameFromText(start) === "EOF" || tokenType(start) === -1
    ? startOffset <= cursorOffset
    : startOffset < cursorOffset;
  if (startsInside
    && cursor.line > tokenLine(start)
    && cursor.column === 0
    && cursor.column <= tokenColumn(start)
    && tokenNameFromText(stop) !== "EOF"
    && tokenType(stop) !== -1) {
    return false;
  }
  return startsInside && cursorOffset < stopOffset;
}

function startsBefore(tree: AntlrParseTreeLike, cursorOffset: number): boolean {
  const start = startToken(tree);
  return start !== undefined && tokenStart(start) >= 0 && tokenStart(start) < cursorOffset;
}

function isRuleNode(tree: AntlrParseTreeLike): boolean {
  return startToken(tree) !== undefined && terminalSymbol(tree) === undefined;
}

function tokenNameFromText(token: AntlrTokenLike): string {
  const text = tokenText(token);
  const match = /^<missing ([A-Z_]+)>$/.exec(text);
  return match?.[1] ?? (tokenType(token) === -1 ? "EOF" : "");
}

function previousToken(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  cursorOffset: number,
): TokenInfo | undefined {
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    const name = token === undefined ? undefined : tokenName(tokenNameResolver, tokenType(token));
    if (token === undefined
      || tokenType(token) === -1
      || tokenStart(token) >= cursorOffset
      || isTechnicalTokenName(name)) {
      continue;
    }
    const indexValue = tokenIndex(token);
    return {
      type: tokenName(tokenNameResolver, tokenType(token)),
      text: tokenText(token),
      ...(indexValue === undefined ? {} : { index: indexValue }),
    };
  }
  return undefined;
}

function previousTokenBefore(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  previous: TokenInfo | undefined,
): TokenInfo | undefined {
  if (previous?.index === undefined) {
    return undefined;
  }
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    const name = token === undefined ? undefined : tokenName(tokenNameResolver, tokenType(token));
    if (token === undefined
      || tokenType(token) === -1
      || (tokenIndex(token) ?? Number.MAX_SAFE_INTEGER) >= previous.index
      || isTechnicalTokenName(name)) {
      continue;
    }
    const indexValue = tokenIndex(token);
    return {
      type: tokenName(tokenNameResolver, tokenType(token)),
      text: tokenText(token),
      ...(indexValue === undefined ? {} : { index: indexValue }),
    };
  }
  return undefined;
}

function isTechnicalTokenName(name: string | undefined): boolean {
  return name === "EOL"
    || name === "INDENT"
    || name === "DEDENT"
    || name === "WRAP"
    || name === "UNWRAP"
    || name === "WHITESPACE"
    || name === "VALUE_EOL";
}

function activeAssignmentName(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  cursorOffset: number,
): string | undefined {
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    if (token === undefined || tokenType(token) === -1 || tokenStart(token) >= cursorOffset) {
      continue;
    }
    if (tokenName(tokenNameResolver, tokenType(token)) !== "EQ") {
      return undefined;
    }
    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex--) {
      const candidate = tokens[candidateIndex];
      if (candidate === undefined) {
        continue;
      }
      if (tokenLine(candidate) !== tokenLine(token)) {
        return undefined;
      }
      if (tokenType(candidate) === -1 || tokenStart(candidate) < 0) {
        continue;
      }
      return tokenText(candidate);
    }
  }
  return undefined;
}

function activePresentationName(
  tokens: readonly AntlrTokenLike[],
  tokenNameResolver: TokenNameResolver,
  cursorOffset: number,
): string | undefined {
  let result: string | undefined;
  for (let index = 0; index + 2 < tokens.length; index++) {
    const define = tokens[index];
    const presentation = tokens[index + 1];
    const name = tokens[index + 2];
    if (define === undefined || presentation === undefined || name === undefined) {
      continue;
    }
    if (tokenStart(define) >= cursorOffset) {
      break;
    }
    const operation = tokenName(tokenNameResolver, tokenType(define));
    if ((operation === "DEFINE" || operation === "EXTEND")
      && tokenName(tokenNameResolver, tokenType(presentation)) === "PRESENTATION"
      && tokenName(tokenNameResolver, tokenType(name)) === "TYPE_IDENTIFIER"
      && tokenStart(name) < cursorOffset) {
      result = tokenText(name);
    }
  }
  return result;
}

function isMissingToken(token: AntlrTokenLike): boolean {
  return tokenStart(token) < 0 || tokenStop(token) < 0 || (tokenIndex(token) ?? -1) < 0;
}

function indentLevel(tree: AntlrParseTreeLike): number {
  return Math.max(0, tokenColumn(startToken(tree))) / 4;
}

function cursorPosition(source: string, offset: number): CursorPosition {
  let line = 1;
  let column = 0;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === "\n") {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return { line, column };
}

function mutableFrame(
  indent: number,
  type: string,
  completionTypes?: readonly string[],
  parentType?: string,
): MutableElementFrame {
  return {
    indent,
    type,
    ...(parentType === undefined ? {} : { parentType }),
    ...(completionTypes === undefined || completionTypes.length === 0 ? {} : { completionTypes }),
    assignedAttributes: new Set(),
  };
}

function optionalProperty<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}

interface CursorPosition {
  readonly line: number;
  readonly column: number;
}

interface FileContextState {
  contextId: string | undefined;
  visibleIdentifiers: Map<string, VisibleIdentifier>;
  frames: MutableElementFrame[];
  operatorFrames: MutableElementFrame[];
  lists: ListFrame[];
  currentOperatorSpelling: string | undefined;
  tokenName: TokenNameResolver;
}

type MutableElementFrame = Omit<ElementFrame, "assignedAttributes"> & {
  readonly assignedAttributes: Set<string>;
};

const DEFINITION_RULES = new Set([
  "definitionFile",
  "declaration",
  "defineOperatorDeclaration",
  "defineTypeDeclaration",
  "defineEnumDeclaration",
  "definePresentationDeclaration",
  "extendTypeDeclaration",
  "extendEnumDeclaration",
  "extendPresentationDeclaration",
  "operatorBodyItem",
  "typeBodyItem",
  "extendTypeBodyItem",
  "constructorDeclaration",
  "attributeDeclaration",
  "anonymousListAttributeDeclaration",
  "typeUnion",
  "typeReference",
  "typeIdentifier",
]);
