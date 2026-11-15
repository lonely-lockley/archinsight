import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openGitVersionedRepository } from '../build/git-adapter-contract-entry.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'archinsight-versioned-repository-'));
const project = path.join(root, 'architecture');
const signal = new AbortController().signal;

try {
  mkdirSync(project);
  git('init', '-q');
  writeFileSync(path.join(project, 'model.ai'), 'context sample\n\nsystem api\n    name = API\n');
  writeFileSync(path.join(project, 'model with spaces.ai'), 'context spaced\n');
  commit('initial');
  const initial = git('rev-parse', 'HEAD').stdout.trim();

  git('mv', 'architecture/model.ai', 'architecture/renamed.ai');
  writeFileSync(path.join(project, 'renamed.ai'), 'context sample\n\nsystem api\n    name = Public API\n');
  commit('rename and change');
  const changed = git('rev-parse', 'HEAD').stdout.trim();

  writeFileSync(path.join(root, 'README.md'), 'head does not change the model');
  commit('unrelated head');
  const head = git('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(path.join(project, 'untracked.ai'), 'context draft\n');

  const repository = await openGitVersionedRepository(project, signal);
  assert(repository, 'Git worktree must expose the versioning capability');
  const catalogue = await repository.catalogueForPath('renamed.ai', signal);
  assert.equal(catalogue.currentRevision, head);
  assert.equal(catalogue.revisions[0].shortId, 'HEAD');
  assert.equal(catalogue.revisions.find((item) => item.id === changed)?.sourcePath, 'renamed.ai');
  assert.equal(catalogue.revisions.find((item) => item.id === initial)?.sourcePath, 'model.ai');

  const untracked = await repository.catalogueForPath('untracked.ai', signal);
  assert.deepEqual(untracked.revisions.map((item) => item.id), [head]);
  const spaced = await repository.catalogueForPath('model with spaces.ai', signal);
  assert(spaced.revisions.some((item) => item.id === initial), 'paths with spaces must be passed as one Git argument');
  await repository.validatePair(initial, head, signal);
  await assert.rejects(repository.validatePair(head, initial, signal));

  const before = await repository.readProjectAt(initial, signal);
  const after = await repository.readProjectAt(changed, signal);
  assert(before.some((item) => item.sourceName === 'model.ai'));
  assert(after.some((item) => item.sourceName === 'renamed.ai'));

  const attributed = await repository.attribute({
    before: initial,
    after: changed,
    origins: {
      'element:sample/api': [{
        side: 'after', role: 'attribute-assignment', sourceName: 'renamed.ai',
        line: 3, column: 1, endLine: 4, endColumn: 22, semanticPath: 'attributes.name.0', precision: 'declaration',
      }],
    },
  }, signal);
  assert(attributed.attribution['element:sample/api'].some((item) =>
    item.commits.some((commit) => commit.hash === changed && commit.authorName === 'Archinsight Test')
  ));
  assert(attributed.diagnostics.some((item) => item.message.includes('declaration')));
  const status = git('status', '--porcelain').stdout;
  assert.equal(status, '?? architecture/untracked.ai\n', 'versioned reads must not mutate the working tree or index');
  await assert.rejects(repository.catalogueForPath('../outside.ai', signal), /outside the project/);
  await assert.rejects(repository.catalogueForPath('nested/../../outside.ai', signal), /outside the project/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(repository.catalogueForPath('renamed.ai', cancelled.signal), { name: 'AbortError' });
  console.log('Git versioned repository contracts passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function commit(message) {
  git('add', '.');
  git('-c', 'user.name=Archinsight Test', '-c', 'user.email=test@archinsight.invalid', 'commit', '-q', '-m', message);
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
