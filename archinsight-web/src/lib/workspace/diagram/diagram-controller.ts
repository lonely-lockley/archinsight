import {
  discoverDeploymentEnvironments,
  type DeploymentEnvironment,
  type LinkProjectResult
} from '@insight/language';
import {
  diagramModeDefinition,
  queryForDiagramMode
} from '@archinsight/workbench/presets';
import type { DiagramMode, EditorViewMode, WorkspaceTab } from '@archinsight/workbench/types';

const defaultDiagramScale = 1;
const minDiagramScale = 0.25;
const maxDiagramScale = 3;
const minEditorSplitRatio = 20;
const maxEditorSplitRatio = 80;

type ToolbarPatch = Partial<Pick<WorkspaceTab,
  | 'diagramMode'
  | 'query'
  | 'queryPreset'
  | 'deploymentEnvironment'
  | 'queryVisible'
  | 'queryPanelHeight'
  | 'diagramScale'
  | 'diagramFit'
  | 'viewMode'
  | 'editorSplitRatio'
  | 'svg'
  | 'dot'
>>;

export type DiagramControllerPorts = {
  activeTab(): WorkspaceTab | undefined;
  linkedAnalysis(): LinkProjectResult | undefined;
  pickerOpen(): boolean;
  setPickerOpen(open: boolean): void;
  refreshDisabled(): boolean;
  setRefreshDisabled(disabled: boolean): void;
  visibleScale(): number;
  setVisibleScale(scale: number): void;
  patchActiveTab(patch: ToolbarPatch): void;
  persistWorkspace(): void;
  scheduleLink(delay?: number): void;
  scheduleFullLink(): void;
  scheduleDiagramUpdate(): void;
  deferEditorLayout(): void;
  schedule(task: () => void, delay: number): number;
  cancel(handle: number): void;
};

export type DiagramController = {
  updateQuery(value: string): void;
  selectMode(mode: DiagramMode): void;
  selectDeploymentEnvironment(environment: string | undefined): void;
  deploymentEnvironmentsFor(tab?: WorkspaceTab, analysis?: LinkProjectResult): readonly DeploymentEnvironment[];
  reconcileDeploymentEnvironment(analysis: LinkProjectResult): boolean;
  closeDeploymentPicker(): void;
  refresh(): void;
  zoom(step: number): void;
  fit(): void;
  actualSize(): void;
  selectViewMode(mode: EditorViewMode): void;
  updateEditorSplitRatio(ratio: number): void;
  updateQueryPanelHeight(height: number): void;
  updateVisibleScale(scale: number): void;
  toggleQuery(): void;
  reset(): void;
  dispose(): void;
};

export function createDiagramController(ports: DiagramControllerPorts): DiagramController {
  let pickerRequested = false;
  let refreshHandle: number | undefined;

  const persistPatch = (patch: ToolbarPatch): void => {
    ports.patchActiveTab(patch);
    ports.persistWorkspace();
  };

  const clearDot = (): void => {
    ports.patchActiveTab({ dot: undefined });
  };

  const deploymentEnvironmentsFor = (
    tab = ports.activeTab(),
    analysis = ports.linkedAnalysis()
  ): readonly DeploymentEnvironment[] => {
    if (analysis === undefined || tab === undefined || tab.projectSource === false) {
      return [];
    }
    const context = analysis.contexts.find((candidate) => candidate.sourceIdentity === tab.sourceIdentity);
    return discoverDeploymentEnvironments(analysis, {
      context: context?.id,
      tab: tab.sourceIdentity
    });
  };

  const selectDeploymentEnvironment = (environment: string | undefined): void => {
    pickerRequested = false;
    ports.setPickerOpen(false);
    persistPatch({
      diagramMode: 'deployment-container',
      query: queryForDiagramMode('deployment-container'),
      queryPreset: true,
      deploymentEnvironment: environment,
      dot: undefined
    });
    if (environment === undefined && ports.activeTab() !== undefined) {
      ports.patchActiveTab({ svg: emptyDiagramSvg('No deployment environments are relevant to this source') });
      return;
    }
    ports.scheduleDiagramUpdate();
  };

  const cancelRefresh = (): void => {
    if (refreshHandle === undefined) {
      return;
    }
    ports.cancel(refreshHandle);
    refreshHandle = undefined;
  };

  return {
    updateQuery(value) {
      const tab = ports.activeTab();
      persistPatch({
        query: value,
        diagramMode: tab?.diagramMode ?? 'default',
        queryPreset: false,
        dot: undefined
      });
      ports.scheduleDiagramUpdate();
    },

    selectMode(mode) {
      if (diagramModeDefinition(mode).environment === 'single-relevant') {
        if (ports.linkedAnalysis() === undefined) {
          pickerRequested = true;
          ports.setPickerOpen(false);
          persistPatch({
            diagramMode: mode,
            query: queryForDiagramMode(mode),
            queryPreset: true,
            dot: undefined
          });
          ports.scheduleLink(0);
          return;
        }
        const environments = deploymentEnvironmentsFor();
        if (environments.length > 1) {
          ports.setPickerOpen(true);
          return;
        }
        selectDeploymentEnvironment(environments[0]?.id);
        return;
      }
      pickerRequested = false;
      ports.setPickerOpen(false);
      persistPatch({
        diagramMode: mode,
        query: queryForDiagramMode(mode),
        queryPreset: true,
        dot: undefined
      });
      ports.scheduleDiagramUpdate();
    },

    selectDeploymentEnvironment,
    deploymentEnvironmentsFor,

    reconcileDeploymentEnvironment(analysis) {
      const tab = ports.activeTab();
      if (tab === undefined || diagramModeDefinition(tab.diagramMode).environment !== 'single-relevant') {
        pickerRequested = false;
        return false;
      }
      const environments = deploymentEnvironmentsFor(tab, analysis);
      const requested = pickerRequested;
      pickerRequested = false;
      if (tab.deploymentEnvironment !== undefined
          && environments.some((environment) => environment.id === tab.deploymentEnvironment)) {
        ports.setPickerOpen(requested && environments.length > 1);
        return false;
      }
      const environment = environments.length === 1 ? environments[0]!.id : undefined;
      persistPatch({ deploymentEnvironment: environment });
      ports.setPickerOpen(environments.length > 1);
      if (environments.length === 0) {
        ports.patchActiveTab({ svg: emptyDiagramSvg('No deployment environments are relevant to this source') });
        return false;
      }
      return true;
    },

    closeDeploymentPicker() {
      ports.setPickerOpen(false);
    },

    refresh() {
      if (ports.refreshDisabled()) {
        return;
      }
      ports.setRefreshDisabled(true);
      clearDot();
      ports.scheduleFullLink();
      cancelRefresh();
      refreshHandle = ports.schedule(() => {
        refreshHandle = undefined;
        ports.setRefreshDisabled(false);
      }, 700);
    },

    zoom(step) {
      const tab = ports.activeTab();
      const visibleScale = ports.visibleScale();
      const baseScale = Number.isFinite(visibleScale)
        ? visibleScale
        : tab?.diagramScale ?? defaultDiagramScale;
      persistPatch({
        diagramScale: clamp(baseScale + step, minDiagramScale, maxDiagramScale),
        diagramFit: false
      });
    },

    fit() {
      persistPatch({ diagramFit: true });
    },

    actualSize() {
      persistPatch({ diagramScale: defaultDiagramScale, diagramFit: false });
    },

    selectViewMode(mode) {
      persistPatch({ viewMode: mode });
      ports.deferEditorLayout();
    },

    updateEditorSplitRatio(ratio) {
      persistPatch({ editorSplitRatio: clamp(ratio, minEditorSplitRatio, maxEditorSplitRatio) });
    },

    updateQueryPanelHeight(height) {
      persistPatch({ queryPanelHeight: height });
      ports.deferEditorLayout();
    },

    updateVisibleScale(scale) {
      ports.setVisibleScale(clamp(scale, minDiagramScale, maxDiagramScale));
    },

    toggleQuery() {
      persistPatch({ queryVisible: !(ports.activeTab()?.queryVisible ?? false) });
      ports.deferEditorLayout();
    },

    reset() {
      pickerRequested = false;
      cancelRefresh();
      ports.setPickerOpen(false);
      ports.setRefreshDisabled(false);
    },

    dispose() {
      cancelRefresh();
    }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function emptyDiagramSvg(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><rect width="900" height="600" fill="#2e2e2e"/><text x="32" y="54" fill="#a8a8a8" font-family="monospace" font-size="16">${message}</text></svg>`;
}
