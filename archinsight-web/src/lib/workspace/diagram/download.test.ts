// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  fileNameWithExtension,
  sanitizeFileName,
  svgToPngBlob,
  svgDimensions,
  svgLengthToPixels,
  validateRasterDimensions
} from './download';

describe('diagram downloads', () => {
  it('sanitizes platform-invalid names and replaces the prior extension', () => {
    expect(sanitizeFileName('  Domain: Context?.ai  ')).toBe('Domain- Context-.ai');
    expect(fileNameWithExtension('Domain: Context.ai', '.svg')).toBe('Domain- Context.svg');
    expect(fileNameWithExtension('report.aiq', '.csv')).toBe('report.csv');
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

  it('passes a self-contained inline technology icon through browser Canvas PNG export', async () => {
    let sourceBlob: Blob | undefined;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new TypeError('Expected SVG Blob');
      sourceBlob = blob;
      return 'blob:technology-icon';
    });
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const png = new Blob(['png-with-icon'], { type: 'image/png' });
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(png));
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 120;
      naturalHeight = 80;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', LoadedImage);

    const svg = '<svg width="120" height="80" xmlns="http://www.w3.org/2000/svg"><g class="technology-icon" pointer-events="none"><svg viewBox="0 0 10 10" color="#f4f4f4"><path fill="currentColor" d="M0 0h10v10z"/></svg></g></svg>';
    await expect(svgToPngBlob(svg)).resolves.toBe(png);
    expect(await sourceBlob?.text()).toContain('class="technology-icon"');
    expect(drawImage).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:technology-icon');

    vi.unstubAllGlobals();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    getContext.mockRestore();
    toBlob.mockRestore();
  });
});
