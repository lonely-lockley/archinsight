export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function technologyIconQuery(source: string, cursorOffset: number): string {
  const offset = Math.max(0, Math.min(cursorOffset, source.length));
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const lineEndOffset = source.indexOf('\n', offset);
  const lineEnd = lineEndOffset < 0 ? source.length : lineEndOffset;
  return /^\s*@icon\(\s*([^)]*)\)/.exec(source.slice(lineStart, lineEnd))?.[1]?.trim() ?? '';
}

/** Build one undoable edit for an icon value or a new annotation at the active line. */
export function technologyIconEdit(source: string, cursorOffset: number, iconId: string): TextEdit {
  const offset = Math.max(0, Math.min(cursorOffset, source.length));
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const lineEndOffset = source.indexOf('\n', offset);
  const lineEnd = lineEndOffset < 0 ? source.length : lineEndOffset;
  const line = source.slice(lineStart, lineEnd);
  const annotation = /^(\s*)@icon\(\s*([^)]*)\)/.exec(line);
  if (annotation !== null) {
    const open = line.indexOf('(');
    const close = line.indexOf(')', open + 1);
    return { start: lineStart + open + 1, end: lineStart + close, text: iconId };
  }
  const indent = /^\s*/.exec(line)?.[0] ?? '';
  return { start: lineStart, end: lineStart, text: `${indent}@icon(${iconId})\n` };
}
