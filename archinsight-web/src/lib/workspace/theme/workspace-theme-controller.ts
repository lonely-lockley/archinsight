import type { RenderTheme } from '@insight/language';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import type { ThemeSource } from './browser-theme-source';

export type WorkspaceThemeController = {
  start(): void;
  dispose(): void;
};

export function createWorkspaceThemeController(ports: {
  source: ThemeSource;
  theme(): RenderTheme;
  setTheme(theme: RenderTheme): void;
  setEditorTheme(theme: RenderTheme): void;
  activeTab(): WorkspaceTab | undefined;
  scheduleDiagramUpdate(): void;
}): WorkspaceThemeController {
  let unsubscribe: (() => void) | undefined;

  const apply = (theme: RenderTheme, renderChangedDiagram: boolean): void => {
    const changed = ports.theme() !== theme;
    ports.setTheme(theme);
    ports.setEditorTheme(theme);
    if (!changed || !renderChangedDiagram) return;
    const tab = ports.activeTab();
    if (tab?.dot !== undefined && tab.queryResult === undefined) {
      ports.scheduleDiagramUpdate();
    }
  };

  return {
    start() {
      apply(ports.source.current(), false);
      unsubscribe?.();
      unsubscribe = ports.source.subscribe((theme) => apply(theme, true));
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = undefined;
    }
  };
}
