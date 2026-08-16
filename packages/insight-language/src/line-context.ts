export interface LineContext {
  readonly indentLevel: number;
  readonly contentBeforeCursor: string;
  readonly replacementPrefix: string;
  readonly replacementStartOffset: number;
  readonly replacementEndOffset: number;
  readonly hasOnlyIndentBeforeCursor: boolean;
  readonly shouldNormalizeCurrentWord: boolean;
}

export function lineContextAt(source: string, cursorOffset: number): LineContext {
  const offset = Math.max(0, Math.min(cursorOffset, source.length));
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineEnd = lineEndAt(source, offset);
  const lineBeforeCursor = source.slice(lineStart, offset);
  const indentWidth = leadingWhitespaceLength(lineBeforeCursor);
  const contentBeforeCursor = lineBeforeCursor.slice(indentWidth);
  const replacementStartColumn = wordStart(lineBeforeCursor);
  const replacementPrefix = replacementPrefixOf(lineBeforeCursor);
  const contentAfterCursor = source.slice(offset, lineEnd);
  const replacementEndColumn = replacementStartColumn < lineBeforeCursor.length
    ? lineBeforeCursor.length + wordEnd(contentAfterCursor)
    : lineBeforeCursor.length;
  const replacementStartOffset = lineStart + replacementStartColumn;
  const replacementEndOffset = lineStart + replacementEndColumn;

  return {
    indentLevel: Math.floor(indentWidth / 4),
    contentBeforeCursor,
    replacementPrefix,
    replacementStartOffset,
    replacementEndOffset,
    hasOnlyIndentBeforeCursor: contentBeforeCursor.trim().length === 0,
    shouldNormalizeCurrentWord: replacementStartOffset < replacementEndOffset && replacementPrefix.length > 0,
  };
}

function leadingWhitespaceLength(text: string): number {
  let index = 0;
  while (index < text.length && isWhitespace(text[index])) {
    index++;
  }
  return index;
}

function wordStart(text: string): number {
  let index = text.length;
  while (index > 0 && isReplacementChar(text[index - 1])) {
    index--;
  }
  return index;
}

function wordEnd(text: string): number {
  let index = 0;
  while (index < text.length && isReplacementChar(text[index])) {
    index++;
  }
  return index;
}

function replacementPrefixOf(text: string): string {
  if (text.length === 0 || isWhitespace(text[text.length - 1])) {
    return "";
  }
  let start = text.length;
  while (start > 0 && isReplacementChar(text[start - 1])) {
    start--;
  }
  return text.slice(start);
}

function isReplacementChar(char: string | undefined): boolean {
  return char !== undefined
    && (isAsciiLetterOrDigit(char) || char === "_" || isOperatorChar(char));
}

function isAsciiLetterOrDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122);
}

function isOperatorChar(char: string): boolean {
  return "!$%&*+-./<>?@\\^|~".includes(char);
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function lineEndAt(source: string, offset: number): number {
  const nextLineBreak = source.indexOf("\n", offset);
  return nextLineBreak < 0 ? source.length : nextLineBreak;
}
