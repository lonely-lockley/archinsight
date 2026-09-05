import type { ProjectUiState } from '@archinsight/workbench/types';
import { clamp, minMessagesHeight, minSidebarWidth, normalizeProjectUi } from './layout-model';

type PointerCoordinates = {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
};

export type LayoutControllerPorts = {
  readState(): ProjectUiState;
  writeState(state: ProjectUiState): void;
  persistWorkspace(): void;
  deferEditorLayout(): void;
  addPointerMove(listener: (event: PointerEvent) => void): void;
  removePointerMove(listener: (event: PointerEvent) => void): void;
  addPointerUp(listener: (event: PointerEvent) => void): void;
  removePointerUp(listener: (event: PointerEvent) => void): void;
};

export type LayoutController = {
  showSidebar(): void;
  toggleSidebar(): void;
  toggleMessages(): void;
  beginSidebarResize(event: PointerCoordinates): void;
  beginMessagesResize(event: PointerCoordinates): void;
  dispose(): void;
};

export function createLayoutController(ports: LayoutControllerPorts): LayoutController {
  let sidebarResizeStart: { pointerId: number; startX: number; width: number } | undefined;
  let messagesResizeStart: { pointerId: number; startY: number; height: number } | undefined;

  const patch = (change: Partial<ProjectUiState>): void => {
    ports.writeState(normalizeProjectUi({ ...ports.readState(), ...change }, []));
    ports.persistWorkspace();
    ports.deferEditorLayout();
  };

  const stopSidebarResize = (): void => {
    sidebarResizeStart = undefined;
    ports.removePointerMove(resizeSidebar);
    ports.removePointerUp(stopSidebarResize);
  };

  const resizeSidebar = (event: PointerEvent): void => {
    if (sidebarResizeStart === undefined || event.pointerId !== sidebarResizeStart.pointerId) {
      return;
    }
    patch({
      sidebarWidth: clamp(
        sidebarResizeStart.width + event.clientX - sidebarResizeStart.startX,
        minSidebarWidth,
        720
      )
    });
  };

  const stopMessagesResize = (): void => {
    messagesResizeStart = undefined;
    ports.removePointerMove(resizeMessages);
    ports.removePointerUp(stopMessagesResize);
  };

  const resizeMessages = (event: PointerEvent): void => {
    if (messagesResizeStart === undefined || event.pointerId !== messagesResizeStart.pointerId) {
      return;
    }
    patch({
      messagesHeight: clamp(
        messagesResizeStart.height + messagesResizeStart.startY - event.clientY,
        minMessagesHeight,
        520
      )
    });
  };

  return {
    showSidebar() {
      patch({ sidebarVisible: true });
    },

    toggleSidebar() {
      patch({ sidebarVisible: !ports.readState().sidebarVisible });
    },

    toggleMessages() {
      patch({ messagesVisible: !ports.readState().messagesVisible });
    },

    beginSidebarResize(event) {
      const state = ports.readState();
      if (!state.sidebarVisible) {
        return;
      }
      stopSidebarResize();
      sidebarResizeStart = {
        pointerId: event.pointerId,
        startX: event.clientX,
        width: state.sidebarWidth
      };
      ports.addPointerMove(resizeSidebar);
      ports.addPointerUp(stopSidebarResize);
    },

    beginMessagesResize(event) {
      const state = ports.readState();
      if (!state.messagesVisible) {
        return;
      }
      stopMessagesResize();
      messagesResizeStart = {
        pointerId: event.pointerId,
        startY: event.clientY,
        height: state.messagesHeight
      };
      ports.addPointerMove(resizeMessages);
      ports.addPointerUp(stopMessagesResize);
    },

    dispose() {
      stopSidebarResize();
      stopMessagesResize();
    }
  };
}
