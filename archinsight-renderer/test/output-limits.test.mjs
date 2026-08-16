import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addOutputBytes,
  expectedPngDimensions,
  validatePngDimensions,
  validateSvgOutput
} from '../src/output-limits.mjs';

const limits = {
  maxSvgBytes: 1024,
  maxPngWidth: 8192,
  maxPngHeight: 8192,
  maxPngPixels: 16_777_216,
  maxTotalOutputBytes: 2048
};

test('calculates physical SVG dimensions at the requested DPI', () => {
  assert.deepEqual(
    expectedPngDimensions('<svg width="72pt" height="36pt" viewBox="0 0 72 36"/>', 600),
    { width: 600, height: 300 }
  );
});

test('rejects a pixel bomb before rasterization', () => {
  const dimensions = expectedPngDimensions(
    '<svg width="7200000pt" height="7200000pt" viewBox="0 0 7200000 7200000"/>',
    600
  );
  assert.throws(() => validatePngDimensions(dimensions.width, dimensions.height, limits), /dimensions are too large/);
});

test('limits individual SVG and aggregate output bytes', () => {
  assert.equal(validateSvgOutput('<svg/>', limits), 6);
  assert.throws(() => validateSvgOutput(`<svg>${'x'.repeat(1024)}</svg>`, limits), /SVG output is too large/);
  assert.equal(addOutputBytes(1000, 1000, limits), 2000);
  assert.throws(() => addOutputBytes(2000, 100, limits), /aggregate render output is too large/);
});
