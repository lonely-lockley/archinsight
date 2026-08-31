import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

export function registerContractFiles(files, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  for (const file of files) {
    test(file, async () => {
      const result = await runNode(file, cwd);
      assert.equal(
        result.code,
        0,
        `${file} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    });
  }
}

function runNode(file, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => resolve({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}
