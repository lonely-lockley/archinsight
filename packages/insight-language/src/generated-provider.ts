import {
  AntlrInsightSyntaxProvider,
  type AntlrAdapterInput,
} from "./antlr-adapter.js";
import type { CompletionRequest } from "./contracts.js";
import { parseInsightSource } from "./parser-facade.js";

export function createGeneratedInsightSyntaxProvider(): AntlrInsightSyntaxProvider {
  return new AntlrInsightSyntaxProvider(parseWithGeneratedInsightParser);
}

export function parseWithGeneratedInsightParser(request: CompletionRequest): AntlrAdapterInput {
  const parsed = parseInsightSource(request);
  return {
    ...parsed,
    cursorOffset: request.cursorOffset,
    ...(request.indexedIdentifiers === undefined ? {} : { indexedIdentifiers: request.indexedIdentifiers }),
    ...(request.contextualIdentifiers === undefined ? {} : { contextualIdentifiers: request.contextualIdentifiers }),
    ...(request.contextIds === undefined ? {} : { contextIds: request.contextIds }),
  };
}
