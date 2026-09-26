import assert from 'node:assert/strict';
import {
  detectSystemRenderTheme,
  parseLinuxTheme,
  parseWindowsTheme,
  resolveRenderTheme,
} from '../build/system-theme.js';

{
  let detectorCalled = false;
  assert.equal(await resolveRenderTheme('dark', async () => { detectorCalled = true; return 'light'; }), 'dark');
  assert.equal(detectorCalled, false, 'an explicit theme must not probe the operating system');
  assert.equal(await resolveRenderTheme('system', async () => 'dark'), 'dark');
  assert.equal(await resolveRenderTheme(undefined, async () => undefined), 'light');
  assert.equal(await resolveRenderTheme(undefined, async () => { throw new Error('unavailable'); }), 'light');
}

{
  const calls = [];
  const run = async (executable, args) => {
    calls.push({ executable, args });
    return { stdout: 'Dark\n', stderr: '' };
  };
  assert.equal(await detectSystemRenderTheme('darwin', run), 'dark');
  assert.deepEqual(calls[0], { executable: 'defaults', args: ['read', '-g', 'AppleInterfaceStyle'] });
  assert.equal(await detectSystemRenderTheme('darwin', async () => ({ stdout: '', stderr: '' })), 'light');
}

{
  const output = 'AppsUseLightTheme    REG_DWORD    0x0';
  assert.equal(await detectSystemRenderTheme('win32', async (executable, args) => {
    assert.equal(executable, 'reg.exe');
    assert(args.includes('AppsUseLightTheme'));
    return { stdout: output, stderr: '' };
  }), 'dark');
  assert.equal(parseWindowsTheme('AppsUseLightTheme REG_DWORD 0x1'), 'light');
  assert.equal(parseWindowsTheme('malformed'), undefined);
}

{
  assert.equal(await detectSystemRenderTheme('linux', async (executable, args) => {
    assert.equal(executable, 'gdbus');
    assert(args.includes('org.freedesktop.appearance'));
    return { stdout: '(<uint32 1>,)', stderr: '' };
  }), 'dark');
  assert.equal(parseLinuxTheme('(uint32 2,)'), 'light');
  assert.equal(parseLinuxTheme('(uint32 0,)'), undefined);
  assert.equal(parseLinuxTheme('malformed'), undefined);
}

assert.equal(await detectSystemRenderTheme('freebsd', async () => ({ stdout: '', stderr: '' })), undefined);
assert.equal(await detectSystemRenderTheme('linux', async () => { throw new Error('timeout'); }), undefined);

console.log('System render theme contracts passed');
