import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '$lib/workspace-types';
import {
  createDownloadController,
  type DownloadControllerPorts
} from './download-controller';

const tab = (overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: 'architecture.ai',
  filePath: 'architecture.ai',
  sourceIdentity: 'architecture.ai',
  title: 'Architecture.ai',
  content: 'system Architecture',
  svg: '<svg>diagram</svg>',
  dot: 'digraph Architecture {}',
  diagnostics: [],
  local: false,
  diagramMode: 'default',
  query: '',
  queryPreset: true,
  queryVisible: false,
  diagramScale: 1,
  diagramFit: false,
  viewMode: 'split',
  editorSplitRatio: 50,
  queryPanelHeight: 118,
  ...overrides
});

function fixture(overrides: Partial<DownloadControllerPorts> = {}) {
  let activeTab: WorkspaceTab | undefined = tab();
  let canDownloadDiagram = true;
  const sanitizeSvg = vi.fn((svg: string) => svg.replace('diagram', 'safe'));
  const pngBlob = new Blob(['png'], { type: 'image/png' });
  const svgToPngBlob = vi.fn(async () => pngBlob);
  const downloadText = vi.fn();
  const downloadBlob = vi.fn();
  const error = vi.fn();
  const controller = createDownloadController({
    activeTab: () => activeTab,
    canDownloadDiagram: () => canDownloadDiagram,
    sanitizeSvg,
    svgToPngBlob,
    downloadText,
    downloadBlob,
    error,
    ...overrides
  });

  return {
    controller,
    sanitizeSvg,
    svgToPngBlob,
    downloadText,
    downloadBlob,
    error,
    pngBlob,
    setActiveTab: (next: WorkspaceTab | undefined) => { activeTab = next; },
    setCanDownloadDiagram: (next: boolean) => { canDownloadDiagram = next; }
  };
}

describe('download controller', () => {
  it('downloads the active source with a normalized source extension', () => {
    const subject = fixture();

    subject.controller.source();

    expect(subject.downloadText).toHaveBeenCalledWith(
      'Architecture.ai',
      'system Architecture',
      'text/plain;charset=utf-8'
    );

    subject.setActiveTab(undefined);
    subject.controller.source();
    expect(subject.downloadText).toHaveBeenCalledOnce();
  });

  it('sanitizes and downloads SVG only while a valid diagram is available', () => {
    const subject = fixture();

    subject.controller.svg();
    expect(subject.downloadText).toHaveBeenCalledWith(
      'Architecture.svg',
      '<svg>safe</svg>',
      'image/svg+xml;charset=utf-8'
    );

    subject.setCanDownloadDiagram(false);
    subject.controller.svg();
    expect(subject.sanitizeSvg).toHaveBeenCalledOnce();
  });

  it('reports invalid sanitized SVG instead of downloading it', () => {
    const subject = fixture({ sanitizeSvg: vi.fn(() => undefined) });

    subject.controller.svg();

    expect(subject.downloadText).not.toHaveBeenCalled();
    expect(subject.error).toHaveBeenCalledWith('Download failed: SVG content is invalid');
  });

  it('renders sanitized SVG to PNG and downloads the resulting blob', async () => {
    const subject = fixture();

    await subject.controller.png();

    expect(subject.svgToPngBlob).toHaveBeenCalledWith('<svg>safe</svg>');
    expect(subject.downloadBlob).toHaveBeenCalledWith('Architecture.png', subject.pngBlob);
  });

  it('reports PNG conversion and validation failures', async () => {
    const invalid = fixture({ sanitizeSvg: vi.fn(() => undefined) });
    await invalid.controller.png();
    expect(invalid.error).toHaveBeenCalledWith('Download failed: SVG content is invalid');

    const rejected = fixture({
      svgToPngBlob: vi.fn(async () => { throw new Error('Canvas unavailable'); })
    });
    await rejected.controller.png();
    expect(rejected.error).toHaveBeenCalledWith('Download failed: Canvas unavailable');
  });

  it('skips PNG rendering without an eligible diagram', async () => {
    const subject = fixture();
    subject.setActiveTab(undefined);
    await subject.controller.png();
    subject.setActiveTab(tab());
    subject.setCanDownloadDiagram(false);
    await subject.controller.png();

    expect(subject.svgToPngBlob).not.toHaveBeenCalled();
  });

  it('downloads DOT when present and ignores tabs without it', () => {
    const subject = fixture();

    subject.controller.dot();
    expect(subject.downloadText).toHaveBeenCalledWith(
      'Architecture.dot',
      'digraph Architecture {}',
      'text/vnd.graphviz;charset=utf-8'
    );

    subject.setActiveTab(tab({ dot: undefined }));
    subject.controller.dot();
    expect(subject.downloadText).toHaveBeenCalledOnce();
  });
});
