import type { Diagnostic } from '$lib/api';
import type { MessageView } from '@archinsight/workbench/types';
import { diagnosticCounts, diagnosticPosition, messageLevel } from '../analysis/diagnostics';

const maxMessages = 250;

export type MessageControllerPorts = {
  readMessages(): MessageView[];
  writeMessages(messages: MessageView[]): void;
  sourceLabel(sourceIdentity: string): string;
  now(): number;
  randomId(): string;
};

export type MessageController = {
  append(entries: Array<Omit<MessageView, 'id' | 'time'>>): void;
  error(message: string): void;
  info(message: string): void;
  fileSaved(path: string): void;
  queryError(message: string, query: string): void;
  cycleSummary(task: string, diagnostics: Diagnostic[]): void;
  reset(): void;
};

export function createMessageController(ports: MessageControllerPorts): MessageController {
  const append = (entries: Array<Omit<MessageView, 'id' | 'time'>>): void => {
    if (entries.length === 0) {
      return;
    }
    const created = entries.map((entry, index) => ({
      ...entry,
      id: `msg:${ports.now()}:${index}:${ports.randomId()}`,
      time: ports.now()
    }));
    ports.writeMessages([...ports.readMessages(), ...created].slice(-maxMessages));
  };

  return {
    append,

    error(message) {
      append([{ level: 'ERROR', message }]);
    },

    info(message) {
      append([{ level: 'INFO', message }]);
    },

    fileSaved(path) {
      append([{ level: 'INFO', message: `Saved file: ${path}` }]);
    },

    queryError(message, query) {
      append([{
        level: 'ERROR',
        source: 'query',
        position: queryErrorPosition(message, query),
        message: `QUERY_ERROR: ${message}`
      }]);
    },

    cycleSummary(task, diagnostics) {
      const counts = diagnosticCounts(diagnostics);
      append([
        ...diagnostics.map((diagnostic) => ({
          level: messageLevel(diagnostic),
          source: ports.sourceLabel(diagnostic.source),
          position: diagnosticPosition(diagnostic),
          message: diagnostic.message
        })),
        {
          level: 'INFO',
          position: '-',
          message: `${task}: errors: ${counts.errors}, warnings: ${counts.warnings}, notes: ${counts.notes}`
        }
      ]);
    },

    reset() {
      ports.writeMessages([]);
    }
  };
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('at ')) ?? 'Unknown error';
}

export function isQueryErrorMessage(message: string): boolean {
  return /\bquery offset\b/i.test(message)
    || /\boffset \d+\b/i.test(message)
    || /^Unexpected query character\b/i.test(message)
    || /^Unclosed query string\b/i.test(message)
    || /^Query is too long\b/i.test(message)
    || /^Unknown query variable\b/i.test(message)
    || /^Boolean operator cannot\b/i.test(message);
}

export function queryErrorPosition(message: string, query: string): string {
  const match = /(?:query offset|offset)\s+(\d+)/i.exec(message);
  if (match === null) {
    return '-';
  }
  const offset = Number(match[1]);
  return Number.isFinite(offset) ? queryOffsetPosition(query, offset) : '-';
}

export function queryOffsetPosition(query: string, offset: number): string {
  const clamped = Math.max(0, Math.min(query.length, offset));
  const lines = query.slice(0, clamped).split(/\r?\n/);
  return `${lines.length}:${(lines.at(-1)?.length ?? 0) + 1}`;
}
