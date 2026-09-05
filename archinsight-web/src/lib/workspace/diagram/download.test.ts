// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  fileNameWithExtension,
  sanitizeFileName,
  svgDimensions,
  svgLengthToPixels,
  validateRasterDimensions
} from './download';

describe('diagram downloads', () => {
  it('sanitizes platform-invalid names and replaces the prior extension', () => {
    expect(sanitizeFileName('  Domain: Context?.ai  ')).toBe('Domain- Context-.ai');
    expect(fileNameWithExtension('Domain: Context.ai', '.svg')).toBe('Domain- Context.svg');
    expect(fileNameWithExtension('   ', '.dot')).toBe('untitled.dot');
  });

  it('converts supported SVG lengths to pixels', () => {
    expect(svgLengthToPixels('72pt')).toBe(96);
    expect(svgLengthToPixels('2.54cm')).toBeCloseTo(96);
    expect(svgLengthToPixels('1in')).toBe(96);
    expect(svgLengthToPixels('50%')).toBeUndefined();
  });

  it('prefers explicit dimensions and falls back to the viewBox', () => {
    expect(svgDimensions('<svg width="640" height="480" viewBox="0 0 10 10"/>')).toEqual({
      width: 640, height: 480
    });
    expect(svgDimensions('<svg viewBox="0 0 1200 800"/>')).toEqual({ width: 1200, height: 800 });
  });

  it('rejects invalid or excessively large raster targets', () => {
    expect(() => validateRasterDimensions(0, 100)).toThrow('invalid');
    expect(() => validateRasterDimensions(9000, 100)).toThrow('too large');
    expect(() => validateRasterDimensions(5000, 5000)).toThrow('too large');
    expect(() => validateRasterDimensions(undefined, undefined)).not.toThrow();
  });
});
