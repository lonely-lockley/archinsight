import assert from 'node:assert/strict';
import test from 'node:test';
import { LatestWinsCoordinator } from '../src/latest-wins.ts';

test('only the newest asynchronous operation remains current', () => {
  const coordinator = new LatestWinsCoordinator();
  const first = coordinator.begin();
  assert.equal(first.generation, 1);
  assert.equal(first.isCurrent(), true);

  const second = coordinator.begin();
  assert.equal(first.isCurrent(), false);
  assert.equal(second.generation, 2);
  assert.equal(second.isCurrent(), true);

  coordinator.cancel();
  assert.equal(second.isCurrent(), false);
});

test('disposal invalidates pending work and is idempotent', () => {
  const coordinator = new LatestWinsCoordinator();
  const pending = coordinator.begin();
  coordinator.dispose();
  coordinator.dispose();
  assert.equal(pending.isCurrent(), false);
  assert.equal(coordinator.begin().isCurrent(), false);
});
