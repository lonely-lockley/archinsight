const maxRasterDimension = 8192;
const maxRasterPixels = 16_777_216;

export async function svgToCanvas(svg: string): Promise<HTMLCanvasElement> {
  const dimensions = svgDimensions(svg);
  validateRasterDimensions(dimensions.width, dimensions.height);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG image could not be decoded'));
      image.src = svgUrl;
    });
    const width = Math.max(1, Math.round(image.naturalWidth || dimensions.width || 1200));
    const height = Math.max(1, Math.round(image.naturalHeight || dimensions.height || 800));
    validateRasterDimensions(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Canvas is not available');
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function validateRasterDimensions(width: number | undefined, height: number | undefined): void {
  if (width === undefined || height === undefined) {
    return;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG dimensions are invalid');
  }
  if (width > maxRasterDimension || height > maxRasterDimension || width * height > maxRasterPixels) {
    throw new Error(`Diagram is too large to rasterize: ${Math.ceil(width)} × ${Math.ceil(height)}`);
  }
}

export function svgDimensions(svg: string): { width?: number; height?: number } {
  const documentSvg = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = documentSvg.documentElement;
  const width = svgLengthToPixels(root.getAttribute('width'));
  const height = svgLengthToPixels(root.getAttribute('height'));
  if (width !== undefined && height !== undefined) {
    return { width, height };
  }
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  return {
    width: width ?? (viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : undefined),
    height: height ?? (viewBox?.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : undefined)
  };
}

export function svgLengthToPixels(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const match = /^\s*([0-9.]+)\s*(px|pt|in|cm|mm)?\s*$/.exec(value);
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  const unit = match[2] ?? 'px';
  if (unit === 'pt') {
    return amount * 96 / 72;
  }
  if (unit === 'in') {
    return amount * 96;
  }
  if (unit === 'cm') {
    return amount * 96 / 2.54;
  }
  if (unit === 'mm') {
    return amount * 96 / 25.4;
  }
  return amount;
}
