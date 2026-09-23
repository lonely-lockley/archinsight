import type { WorkspaceTab } from '@archinsight/workbench/types';
import { formatQueryTableCsv } from '@insight/language';
import { errorMessage } from '../messages/message-controller';
import {
  fileNameWithExtension,
  type DownloadExtension
} from './download';

export type DownloadControllerPorts = {
  activeTab(): WorkspaceTab | undefined;
  canDownloadDiagram(): boolean;
  sanitizeSvg(svg: string): string | undefined;
  svgToPngBlob(svg: string): Promise<Blob>;
  downloadText(fileName: string, content: string, type: string): void;
  downloadBlob(fileName: string, blob: Blob): void;
  error(message: string): void;
};

export type DownloadController = {
  source(): void;
  svg(): void;
  png(): Promise<void>;
  dot(): void;
  csv(): void;
  json(): void;
};

export function createDownloadController(ports: DownloadControllerPorts): DownloadController {
  const fileName = (tab: WorkspaceTab, extension: DownloadExtension): string => (
    fileNameWithExtension(tab.title, extension)
  );

  return {
    source() {
      const tab = ports.activeTab();
      if (tab !== undefined) {
        ports.downloadText(fileName(tab, '.ai'), tab.content, 'text/plain;charset=utf-8');
      }
    },

    svg() {
      const tab = ports.activeTab();
      if (tab === undefined || !ports.canDownloadDiagram()) return;
      const sanitized = ports.sanitizeSvg(tab.svg);
      if (!sanitized) {
        ports.error('Download failed: SVG content is invalid');
        return;
      }
      ports.downloadText(fileName(tab, '.svg'), sanitized, 'image/svg+xml;charset=utf-8');
    },

    async png() {
      const tab = ports.activeTab();
      if (tab === undefined || !ports.canDownloadDiagram()) return;
      try {
        const sanitized = ports.sanitizeSvg(tab.svg);
        if (!sanitized) throw new Error('SVG content is invalid');
        ports.downloadBlob(fileName(tab, '.png'), await ports.svgToPngBlob(sanitized));
      } catch (error) {
        ports.error(`Download failed: ${errorMessage(error)}`);
      }
    },

    dot() {
      const tab = ports.activeTab();
      if (tab?.dot !== undefined) {
        ports.downloadText(fileName(tab, '.dot'), tab.dot, 'text/vnd.graphviz;charset=utf-8');
      }
    },

    csv() {
      const tab = ports.activeTab();
      if (tab?.queryResult !== undefined) {
        ports.downloadText(fileName(tab, '.csv'), formatQueryTableCsv(tab.queryResult), 'text/csv;charset=utf-8');
      }
    },

    json() {
      const tab = ports.activeTab();
      if (tab?.queryResult !== undefined) {
        ports.downloadText(fileName(tab, '.json'), `${JSON.stringify(tab.queryResult, null, 2)}\n`, 'application/json;charset=utf-8');
      }
    }
  };
}
