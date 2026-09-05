import { terminateBrowserGraphvizWorker } from '$lib/graphviz-renderer';
import type { AnalysisController } from '$lib/workspace/analysis/analysis-controller';
import type { AuthController } from '$lib/workspace/auth/auth-controller';
import type { DiagramController } from '$lib/workspace/diagram/diagram-controller';
import type { MonacoSession } from '$lib/workspace/editor/monaco-session';
import type { MessageController } from '$lib/workspace/messages/message-controller';
import { errorMessage } from '$lib/workspace/messages/message-controller';
import type { ProjectSessionController } from '$lib/workspace/projects/project-session-controller';
import type { LayoutController } from '$lib/workspace/shell/layout-controller';
import type { WorkspaceActionController } from '$lib/workspace/shell/workspace-action-controller';
import type { WorkspaceRuntimeHost } from '$lib/workspace/shell/workspace-runtime-types';

export type WorkspaceRuntimeLifecycle = {
  start(): Promise<void>;
  dispose(): void;
};

export function createWorkspaceRuntimeLifecycle(ports: {
  host: WorkspaceRuntimeHost;
  auth: AuthController;
  action: WorkspaceActionController;
  analysis: AnalysisController;
  diagram: DiagramController;
  layout: LayoutController;
  messages: MessageController;
  monaco: MonacoSession;
  projects: ProjectSessionController;
  closeRepositoryMenu(): void;
}): WorkspaceRuntimeLifecycle {
  return {
    async start() {
      ports.monaco.startLanguageWorker();
      if (!await ports.auth.authorizeWorkspace()) return;
      try {
        await ports.monaco.setupEditor();
        await ports.projects.loadProjects();
        const state = ports.host.state();
        if (ports.host.surface() === 'editor' && (state.currentUser.capabilities ?? []).includes('publication:manage')) {
          await ports.projects.loadPublication();
        }
        if (ports.host.state().activeProjectId !== undefined) await ports.projects.loadProject();
      } catch (error) {
        if (ports.auth.redirectIfAuthRequired(error)) return;
        ports.messages.error(`Startup error: ${errorMessage(error)}`);
      }
      window.addEventListener('keydown', ports.action.handleGlobalKeydown);
      window.addEventListener('click', ports.closeRepositoryMenu);
    },

    dispose() {
      ports.analysis.dispose();
      ports.diagram.dispose();
      ports.layout.dispose();
      window.removeEventListener('keydown', ports.action.handleGlobalKeydown);
      window.removeEventListener('click', ports.closeRepositoryMenu);
      ports.monaco.dispose();
      terminateBrowserGraphvizWorker();
    }
  };
}
