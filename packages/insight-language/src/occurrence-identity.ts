const separator = '@@';

export interface DiagramOccurrenceIdentity {
  readonly canonicalId: string;
  readonly qualifier?: string;
}

export function parseDiagramOccurrenceId(id: string): DiagramOccurrenceIdentity {
  const index = id.indexOf(separator);
  return index < 0
    ? { canonicalId: id }
    : { canonicalId: id.slice(0, index), qualifier: id.slice(index + separator.length) };
}

export function diagramOccurrenceId(canonicalId: string, qualifier: string): string {
  if (canonicalId.includes(separator) || qualifier === '' || qualifier.includes(separator)) {
    throw new Error('Diagram occurrence identity must contain one non-empty qualifier');
  }
  return `${canonicalId}${separator}${qualifier}`;
}

export function replaceDiagramOccurrenceCanonical(id: string, canonicalId: string): string {
  const parsed = parseDiagramOccurrenceId(id);
  return parsed.qualifier === undefined ? canonicalId : diagramOccurrenceId(canonicalId, parsed.qualifier);
}
