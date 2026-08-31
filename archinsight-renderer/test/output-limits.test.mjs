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

test('supports CSS length units and falls back to a valid viewBox', () => {
  assert.deepEqual(expectedPngDimensions('<svg width="2in" height="1in"/>', 300), {
    width: 600,
    height: 300
  });
  assert.deepEqual(expectedPngDimensions('<svg width="2.54cm" height="25.4mm"/>', 200), {
    width: 200,
    height: 200
  });
  assert.deepEqual(expectedPngDimensions("<svg viewBox='0, 0, 12.2, 7.1'/>", 200), {
    width: 13,
    height: 8
  });
  assert.deepEqual(expectedPngDimensions('<svg width="10px" viewBox="0 0 20 30"/>', 200), {
    width: 10,
    height: 30
  });
});

test('rejects SVG dimensions that cannot be determined safely', () => {
  assert.throws(() => expectedPngDimensions('not svg', 200), /does not contain a root element/);
  assert.throws(() => expectedPngDimensions('<svg/>', 200), /cannot be determined safely/);
  assert.throws(
    () => expectedPngDimensions('<svg width="calc(100%)" height="0"/>', 200),
    /cannot be determined safely/
  );
});

test('rejects a pixel bomb before rasterization', () => {
  const dimensions = expectedPngDimensions(
    '<svg width="7200000pt" height="7200000pt" viewBox="0 0 7200000 7200000"/>',
    600
  );
  assert.throws(() => validatePngDimensions(dimensions.width, dimensions.height, limits), /dimensions are too large/);
});

test('rejects invalid, oversized, and excessive-area PNG dimensions', () => {
  assert.throws(() => validatePngDimensions(0, 1, limits), /dimensions are invalid/);
  assert.throws(() => validatePngDimensions(1.5, 1, limits), /dimensions are invalid/);
  assert.throws(() => validatePngDimensions(8193, 1, limits), /dimensions are too large/);
  assert.throws(() => validatePngDimensions(4097, 4097, limits), /pixel count is too large/);
  assert.doesNotThrow(() => validatePngDimensions(4096, 4096, limits));
});

test('limits individual SVG and aggregate output bytes', () => {
  assert.equal(validateSvgOutput('<svg/>', limits), 6);
  assert.equal(validateSvgOutput('😀', limits), 4);
  assert.throws(() => validateSvgOutput(`<svg>${'x'.repeat(1024)}</svg>`, limits), /SVG output is too large/);
  assert.equal(addOutputBytes(1000, 1000, limits), 2000);
  assert.throws(() => addOutputBytes(2000, 100, limits), /aggregate render output is too large/);
  assert.throws(
    () => addOutputBytes(Number.MAX_SAFE_INTEGER, 1, { ...limits, maxTotalOutputBytes: Number.MAX_SAFE_INTEGER }),
    /aggregate render output is too large/
  );
});
