import { describe, expect, it } from 'vitest';
import type { MessageView } from '@archinsight/workbench/types';
import {
  createMessageController,
  errorMessage,
  isQueryErrorMessage,
  queryErrorPosition,
  queryOffsetPosition
} from './message-controller';

function fixture() {
  let messages: MessageView[] = [];
  let id = 0;
  const controller = createMessageController({
    readMessages: () => messages,
    writeMessages: (next) => { messages = next; },
    sourceLabel: (source) => `label:${source}`,
    now: () => 42,
    randomId: () => String(++id)
  });
  return { controller, messages: () => messages };
}

describe('message controller', () => {
  it('adds stable metadata and simple status messages', () => {
    const subject = fixture();
    subject.controller.fileSaved('main.ai');
    subject.controller.error('broken');
    subject.controller.info('ready');
    subject.controller.queryError('bad at offset 2', 'abc');

    expect(subject.messages()).toMatchObject([
      { id: 'msg:42:0:1', time: 42, level: 'INFO', message: 'Saved file: main.ai' },
      { id: 'msg:42:0:2', time: 42, level: 'ERROR', message: 'broken' },
      { level: 'INFO', message: 'ready' },
      { level: 'ERROR', source: 'query', position: '1:3', message: 'QUERY_ERROR: bad at offset 2' }
    ]);
  });

  it('reports diagnostic details followed by a cycle summary', () => {
    const subject = fixture();
    subject.controller.cycleSummary('Linker finished', [{
      source: 'main.ai', line: 2, column: 3, level: 'ERROR', code: 'E1', message: 'bad'
    }]);

    expect(subject.messages()[0]).toMatchObject({ source: 'label:main.ai', position: '2:4', message: 'bad' });
    expect(subject.messages()[1]?.message).toBe('Linker finished: errors: 1, warnings: 0, notes: 0');
  });

  it('keeps only the newest 250 messages and can reset them', () => {
    const subject = fixture();
    subject.controller.append(Array.from({ length: 260 }, (_, index) => ({
      level: 'INFO' as const,
      message: String(index)
    })));
    expect(subject.messages()).toHaveLength(250);
    expect(subject.messages()[0]?.message).toBe('10');
    subject.controller.reset();
    expect(subject.messages()).toEqual([]);
  });

  it('extracts the first useful line from arbitrary failures', () => {
    expect(errorMessage(new Error('\nUseful failure\n    at internal'))).toBe('Useful failure');
    expect(errorMessage('plain failure')).toBe('plain failure');
  });

  it('recognizes query errors without classifying unrelated failures', () => {
    expect(isQueryErrorMessage('Unexpected query character `@`')).toBe(true);
    expect(isQueryErrorMessage('Failure at query offset 8')).toBe(true);
    expect(isQueryErrorMessage('HTTP 500')).toBe(false);
  });

  it('maps query offsets to one-based line and columns', () => {
    expect(queryOffsetPosition('one\ntwo', 5)).toBe('2:2');
    expect(queryErrorPosition('bad at offset 5', 'one\ntwo')).toBe('2:2');
    expect(queryErrorPosition('no offset', 'query')).toBe('-');
  });
});
