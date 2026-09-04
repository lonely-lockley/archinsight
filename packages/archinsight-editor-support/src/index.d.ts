export type EditorCompletionKind =
  | "KEYWORD"
  | "CONSTRUCTOR"
  | "OPERATOR"
  | "ATTRIBUTE"
  | "IDENTIFIER"
  | "ENUM_VALUE"
  | "TYPE"
  | "ANNOTATION"
  | "NEWLINE";

export interface EditorCompletionItem {
  readonly kind: EditorCompletionKind;
  readonly label: string;
  readonly imported?: boolean;
}

export declare function completionDetail(item: Pick<EditorCompletionItem, "kind" | "imported">): string;
export declare function completionSortBucket(kind: EditorCompletionKind): string;
export declare function completionSortText(item: Pick<EditorCompletionItem, "kind" | "label">): string;

export declare function semanticTokenModifierBits(
  modifiers: readonly string[] | undefined,
  vocabulary: readonly string[]
): number;

export declare function filterTreeByQuery<T extends { readonly children: readonly T[] }>(
  nodes: readonly T[],
  query: string,
  searchText: (node: T) => string
): T[];

export interface DiagnosticIdentityFields {
  readonly source: string;
  readonly level?: string;
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export declare function diagnosticIdentity(diagnostic: DiagnosticIdentityFields): string;
