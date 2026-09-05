import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderQueue, RenderQueueFullError } from '../src/render-queue.mjs';

test('limits concurrent renders and drains the bounded queue', async () => {
  const queue = new RenderQueue(1, 1);
  const firstGate = deferred();
  const started = [];
  const first = queue.run(async () => {
    started.push('first');
    await firstGate.promise;
    return 'first';
  });
  const second = queue.run(async () => {
    started.push('second');
    return 'second';
  });

  await Promise.resolve();
  assert.deepEqual(started, ['first']);
  assert.equal(queue.active, 1);
  assert.equal(queue.queued, 1);

  firstGate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(started, ['first', 'second']);
  assert.equal(queue.active, 0);
  assert.equal(queue.queued, 0);
});

test('rejects work when all worker and queue slots are occupied', async () => {
  const queue = new RenderQueue(1, 1);
  const gate = deferred();
  const first = queue.run(() => gate.promise);
  const second = queue.run(() => 'second');

  await assert.rejects(queue.run(() => 'third'), RenderQueueFullError);
  gate.resolve('first');
  await Promise.all([first, second]);
});

test('releases capacity and drains queued work after a task fails', async () => {
  const queue = new RenderQueue(1, 1);
  const gate = deferred();
  const first = queue.run(async () => {
    await gate.promise;
    throw new Error('render failed');
  });
  const second = queue.run(() => 'recovered');

  gate.resolve();
  await assert.rejects(first, /render failed/);
  assert.equal(await second, 'recovered');
  assert.equal(queue.active, 0);
  assert.equal(queue.queued, 0);
});

function deferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
