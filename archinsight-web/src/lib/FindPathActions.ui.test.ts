// @vitest-environment happy-dom

import FindPathActions from '@archinsight/workbench/find-path-actions';
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FindPathActions', () => {
  it('shows a persistent source prompt in the toolbar and supports explicit cancellation', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancel = vi.fn();
    const component = mount(FindPathActions, {
      target,
      props: {
        mode: { status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' },
        onCancel
      }
    });
    await tick();

    expect(target.textContent).toContain('Find path: API → select target');
    target.querySelector<HTMLButtonElement>('button[aria-label="Cancel find path"]')?.click();
    expect(onCancel).toHaveBeenCalledOnce();

    await unmount(component);
  });

  it('returns from a shown path with the toolbar action or Escape except while a radial menu is open', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const menu = document.createElement('div');
    menu.dataset.diagramQuickActionsMenu = '';
    document.body.append(menu);
    const onCancel = vi.fn();
    const onReverse = vi.fn();
    const component = mount(FindPathActions, {
      target,
      props: {
        mode: {
          status: 'showing-path', sourceId: 'shop/api', sourceTitle: 'API',
          targetId: 'shop/db', targetTitle: 'Database'
        },
        onCancel,
        onReverse
      }
    });
    await tick();

    expect(target.querySelector('[aria-label="Find path mode"]')).not.toBeNull();
    expect(target.textContent).toContain('Path: API → Database');
    expect(target.querySelector<HTMLButtonElement>('button[aria-label="Back to diagram"]')).not.toBeNull();
    const reverse = target.querySelector<HTMLButtonElement>('button[aria-label="Reverse path direction"]');
    expect(reverse).not.toBeNull();
    expect(reverse?.querySelector('.codicon-sync')).not.toBeNull();
    reverse?.click();
    expect(onReverse).toHaveBeenCalledOnce();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).not.toHaveBeenCalled();
    menu.remove();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalledOnce();

    target.querySelector<HTMLButtonElement>('button[aria-label="Back to diagram"]')?.click();
    expect(onCancel).toHaveBeenCalledTimes(2);

    await unmount(component);
  });

  it('shows an isolated element and returns to the original diagram', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancelIsolate = vi.fn();
    const component = mount(FindPathActions, {
      target,
      props: {
        isolateMode: { status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API' },
        onCancelIsolate
      }
    });
    await tick();

    expect(target.querySelector('[aria-label="Isolate mode"]')).not.toBeNull();
    expect(target.textContent).toContain('Isolated: API');
    target.querySelector<HTMLButtonElement>('button[aria-label="Back to diagram"]')?.click();
    expect(onCancelIsolate).toHaveBeenCalledOnce();

    await unmount(component);
  });

  it('shows a deployment result and returns to the original diagram', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancelDeployment = vi.fn();
    const component = mount(FindPathActions, {
      target,
      props: {
        deploymentMode: {
          status: 'showing-deployment', elementId: 'shop/api', elementTitle: 'API', environment: 'eu',
          focusElementIds: ['shop/api']
        },
        onCancelDeployment
      }
    });
    await tick();

    expect(target.querySelector('[aria-label="Deployment mode"]')).not.toBeNull();
    expect(target.textContent).toContain('Deployment: API · eu');
    target.querySelector<HTMLButtonElement>('button[aria-label="Back to diagram"]')?.click();
    expect(onCancelDeployment).toHaveBeenCalledOnce();

    await unmount(component);
  });
});
