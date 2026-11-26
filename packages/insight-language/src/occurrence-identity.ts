const separator = '@@';
type IsolateRole = 'incoming' | 'outgoing';

export interface DiagramOccurrenceIdentity {
  readonly canonicalId: string;
  readonly qualifier?: string;
  readonly isolateRole?: IsolateRole;
}

export function parseDiagramOccurrenceId(id: string): DiagramOccurrenceIdentity {
  const index = id.indexOf(separator);
  if (index < 0) return { canonicalId: id };
  const last = id.lastIndexOf(separator);
  const suffix = id.slice(last + separator.length);
  if (suffix === 'isolate-incoming' || suffix === 'isolate-outgoing') {
    return {
      canonicalId: id.slice(0, index),
      ...(last > index && { qualifier: id.slice(index + separator.length, last) }),
      isolateRole: suffix === 'isolate-incoming' ? 'incoming' : 'outgoing',
    };
  }
  return { canonicalId: id.slice(0, index), qualifier: id.slice(index + separator.length) };
}

export function diagramOccurrenceId(canonicalId: string, qualifier: string): string {
  if (canonicalId.includes(separator) || qualifier === '' || qualifier.includes(separator)) {
    throw new Error('Diagram occurrence identity must contain one non-empty qualifier');
  }
  return `${canonicalId}${separator}${qualifier}`;
}

function formatOccurrence({canonicalId, qualifier, isolateRole}: DiagramOccurrenceIdentity): string {
  const id = qualifier === undefined ? canonicalId : diagramOccurrenceId(canonicalId, qualifier);
  return isolateRole === undefined ? id : `${id}${separator}isolate-${isolateRole}`;
}

export function isolateOccurrenceId(id: string, isolateRole: IsolateRole): string {
  return formatOccurrence({...parseDiagramOccurrenceId(id), isolateRole});
}

export function replaceDiagramOccurrenceCanonical(id: string, canonicalId: string): string {
  return formatOccurrence({...parseDiagramOccurrenceId(id), canonicalId});
}
