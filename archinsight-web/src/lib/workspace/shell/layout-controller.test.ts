import { describe, expect, it, vi } from 'vitest';
import type { ProjectUiState } from '$lib/workspace-types';
import { createLayoutController, type LayoutControllerPorts } from './layout-controller';
import { defaultProjectUi, normalizeProjectUi } from './layout-model';

function fixture(initial: ProjectUiState = defaultProjectUi()) {
  let state = initial;
  let move: ((event: PointerEvent) => void) | undefined;
  let up: (() => void) | undefined;
  const ports: LayoutControllerPorts = {
    readState: () => state,
    writeState: (next) => { state = next; },
    persistWorkspace: vi.fn(),
    deferEditorLayout: vi.fn(),
    addPointerMove: vi.fn((listener) => { move = listener; }),
    removePointerMove: vi.fn(),
    addPointerUp: vi.fn((listener) => { up = listener; }),
    removePointerUp: vi.fn()
  };
  return {
    ports,
    controller: createLayoutController(ports),
    state: () => state,
    move: (event: Partial<PointerEvent>) => move?.(event as PointerEvent),
    up: () => up?.()
  };
}

describe('workspace layout', () => {
  it('normalizes legacy UI and clamps unsafe dimensions', () => {
    expect(normalizeProjectUi(undefined, [{
      id: 'old', title: 'old', ui: { sidebarWidth: 20, messagesHeight: 900 }
    }])).toMatchObject({ sidebarWidth: 150, messagesHeight: 520 });
  });

  it('toggles panels and persists each accepted change', () => {
    const subject = fixture();
    subject.controller.toggleSidebar();
    subject.controller.toggleMessages();
    subject.controller.showSidebar();

    expect(subject.state()).toMatchObject({ sidebarVisible: true, messagesVisible: true });
    expect(subject.ports.persistWorkspace).toHaveBeenCalledTimes(3);
    expect(subject.ports.deferEditorLayout).toHaveBeenCalledTimes(3);
  });

  it('resizes the sidebar only for its initiating pointer and clamps it', () => {
    const subject = fixture();
    subject.controller.beginSidebarResize({ pointerId: 7, clientX: 100, clientY: 0 });
    subject.move({ pointerId: 8, clientX: 700 });
    expect(subject.state().sidebarWidth).toBe(300);
    subject.move({ pointerId: 7, clientX: 900 });
    expect(subject.state().sidebarWidth).toBe(720);
    subject.up();
    expect(subject.ports.removePointerMove).toHaveBeenCalled();
  });

  it('resizes the visible messages panel upward', () => {
    const subject = fixture({ ...defaultProjectUi(), messagesVisible: true });
    subject.controller.beginMessagesResize({ pointerId: 3, clientX: 0, clientY: 500 });
    subject.move({ pointerId: 3, clientY: 400 });
    expect(subject.state().messagesHeight).toBe(280);
  });

  it('does not start resizing hidden panels and disposes registered listeners', () => {
    const subject = fixture({ ...defaultProjectUi(), sidebarVisible: false, messagesVisible: false });
    subject.controller.beginSidebarResize({ pointerId: 1, clientX: 0, clientY: 0 });
    subject.controller.beginMessagesResize({ pointerId: 1, clientX: 0, clientY: 0 });
    expect(subject.ports.addPointerMove).not.toHaveBeenCalled();
    subject.controller.dispose();
    expect(subject.ports.removePointerMove).toHaveBeenCalledTimes(2);
  });
});
