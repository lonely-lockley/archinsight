// @vitest-environment happy-dom

import TechnologyIconPicker from '@archinsight/workbench/technology-icon-picker-component';
import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

describe('TechnologyIconPicker', () => {
  it('filters previews, supports keyboard selection, and cancels without selecting', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const target = document.createElement('div');
    document.body.append(target);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const component = mount(TechnologyIconPicker, { target, props: { initialQuery: 'postgre', onSelect, onClose } });
    await tick();

    const dialog = target.querySelector<HTMLElement>('[role="dialog"]');
    const input = target.querySelector<HTMLInputElement>('[aria-label="Filter technology icons"]')!;
    expect(dialog?.classList.contains('archinsight-picker')).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
    expect(target.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(target.textContent).toContain('postgresql');
    await vi.waitFor(() => expect(target.querySelector('.icon-preview svg')).not.toBeNull());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelect).toHaveBeenCalledWith('postgresql');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledOnce();

    await unmount(component);
    target.remove();
    vi.unstubAllGlobals();
  });

  it('moves through the bounded result list with arrow keys', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(TechnologyIconPicker, { target });
    await tick();
    const input = target.querySelector<HTMLInputElement>('input')!;
    input.focus();
    const options = target.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options.length).toBeGreaterThan(1);
    expect(options.length).toBeLessThanOrEqual(50);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await vi.waitFor(() => expect(document.activeElement).toBe(options[1]));
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
    await unmount(component);
    target.remove();
  });
});
