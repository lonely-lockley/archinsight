// @vitest-environment happy-dom

import SvgPreviewPanel from '@archinsight/workbench/svg-preview';
import { renderIdentity, type DiagramQuickActionMetadata } from '@insight/language';
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactiveTestProps } from './SvgPreviewPanel.test-state.svelte';

const metadata: DiagramQuickActionMetadata = {
  'shop/storefront': {
    elementId: 'shop/storefront', canonicalElementId: 'shop/storefront', title: 'Storefront', hasChildren: true,
    hasDeployment: false, declaration: { sourceName: 'model.ai', line: 1, column: 1 }, isolateEligible: true, pathEligible: true
  },
  'shop/api': {
    elementId: 'shop/api', canonicalElementId: 'shop/api', title: 'API', hasChildren: true,
    hasDeployment: false, declaration: { sourceName: 'model.ai', line: 4, column: 5 }, isolateEligible: true, pathEligible: true
  },
  'shop/db': {
    elementId: 'shop/db', canonicalElementId: 'shop/db', title: 'Database', hasChildren: false,
    hasDeployment: true, declaration: { sourceName: 'model.ai', line: 8, column: 5 }, isolateEligible: true, pathEligible: true
  }
};

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
  <g id="cluster_${renderIdentity('cluster', ['shop/storefront'])}" class="cluster">
    <polygon points="5,5 295,5 295,175 5,175" fill="none" stroke="#777"/>
    <text x="20" y="18">Storefront</text>
  </g>
  <g id="${renderIdentity('node', ['shop/api'])}" class="node">
    <polygon points="20,20 130,20 130,80 20,80" fill="#333" stroke="#777"/>
    <text x="75" y="50">API</text>
  </g>
  <g id="${renderIdentity('node', ['shop/db'])}" class="node">
    <a href="insight://goto?source=model.ai&amp;line=8&amp;column=5">
      <polygon points="170,90 280,90 280,150 170,150" fill="#333" stroke="#777"/>
      <text x="225" y="120">Database</text>
    </a>
  </g>
</svg>`;

const compactSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="${renderIdentity('node', ['shop/api'])}" class="node">
    <polygon points="10,10 110,10 110,70 10,70" fill="#333" stroke="#777"/>
    <text x="60" y="40">API</text>
  </g>
</svg>`;

let originalBounds: typeof Element.prototype.getBoundingClientRect;
let originalBBox: typeof SVGGElement.prototype.getBBox;

beforeEach(() => {
  originalBounds = Element.prototype.getBoundingClientRect;
  originalBBox = SVGGElement.prototype.getBBox;
  Element.prototype.getBoundingClientRect = function () {
    if (this instanceof SVGGElement) {
      const api = this.id.includes(new TextEncoder().encode('shop/api')[0]!.toString(16));
      return rect(api ? 20 : 170, api ? 20 : 90, 110, 60);
    }
    return rect(0, 0, 320, 200);
  };
  SVGGElement.prototype.getBBox = function () {
    const api = this.id.includes(new TextEncoder().encode('shop/api')[0]!.toString(16));
    return rect(api ? 20 : 170, api ? 20 : 90, 110, 60);
  };
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalBounds;
  SVGGElement.prototype.getBBox = originalBBox;
  document.body.innerHTML = '';
});

describe('SvgPreviewPanel quick actions', () => {
  it('selects a node on a plain click and opens declaration only from the menu', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onOpenDeclaration = vi.fn();
    const onDiagramQuickAction = vi.fn();
    const component = mount(SvgPreviewPanel, {
      target,
      props: { svg, quickActionMetadata: metadata, onOpenDeclaration, onDiagramQuickAction }
    });
    await settle();

    const apiGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/api']))}`)!;
    apiGroup.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(onOpenDeclaration).not.toHaveBeenCalled();
    expect(apiGroup.classList.contains('archinsight-node-selected')).toBe(true);

    const trigger = target.querySelector<HTMLButtonElement>('button[aria-label="Quick actions for API"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.hasAttribute('title')).toBe(false);
    expect(target.querySelector('button[aria-label="Quick actions for Storefront"]')).toBeNull();
    expect(apiGroup.contains(trigger)).toBe(true);
    const triggerHost = trigger?.closest('foreignObject');
    expect(triggerHost?.getAttribute('x')).toBe('114');
    expect(triggerHost?.getAttribute('y')).toBe('20');
    trigger?.click();
    await tick();
    expect(target.querySelector<HTMLButtonElement>('button[aria-label="Isolate"]')).not.toBeNull();
    expect(target.querySelector<HTMLButtonElement>('button[aria-label="Drill down"]')).toBeNull();
    const deployment = target.querySelector<HTMLButtonElement>('button[aria-label^="Show deployment"]');
    expect(deployment?.getAttribute('aria-disabled')).toBe('true');
    expect(deployment?.hasAttribute('title')).toBe(false);
    deployment?.focus();
    expect(document.activeElement).toBe(deployment);
    deployment?.click();
    expect(onDiagramQuickAction).not.toHaveBeenCalled();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await tick();
    expect(target.querySelector('[role="menu"]')).toBeNull();
    trigger?.click();
    await tick();
    target.querySelector<HTMLButtonElement>('button[aria-label="Go to declaration"]')?.click();
    expect(onDiagramQuickAction).toHaveBeenCalledWith('go-to-declaration', 'shop/api');

    await unmount(component);
  });

  it('selects a compatible target and gives an open menu priority on Escape', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onSelectPathTarget = vi.fn();
    const onOpenDeclaration = vi.fn();
    const component = mount(SvgPreviewPanel, {
      target,
      props: {
        svg,
        quickActionMetadata: metadata,
        findPathMode: { status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' },
        onSelectPathTarget,
        onOpenDeclaration
      }
    });
    await settle();

    const apiGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/api']))}`)!;
    const dbGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/db']))}`)!;
    const storefrontBoundary = target.querySelector<SVGGElement>(`#${CSS.escape(`cluster_${renderIdentity('cluster', ['shop/storefront'])}`)}`)!;
    expect(apiGroup.classList.contains('archinsight-path-source')).toBe(true);

    const trigger = target.querySelector<HTMLButtonElement>('button[aria-label="Quick actions for Database"]')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await tick();
    expect(target.querySelector('[role="menu"]')).not.toBeNull();
    expect(onSelectPathTarget).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(target.querySelector('[role="menu"]')).toBeNull();

    storefrontBoundary.querySelector('polygon')?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(onSelectPathTarget).not.toHaveBeenCalled();

    dbGroup.querySelector('polygon')?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(onSelectPathTarget).toHaveBeenCalledWith('shop/db');
    expect(onOpenDeclaration).not.toHaveBeenCalled();

    await unmount(component);
  });

  it('reports the show deployment action button as the picker anchor', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onDiagramQuickAction = vi.fn();
    const component = mount(SvgPreviewPanel, {
      target,
      props: { svg, quickActionMetadata: metadata, onDiagramQuickAction }
    });
    await settle();

    target.querySelector<HTMLButtonElement>('button[aria-label="Quick actions for Database"]')?.click();
    await tick();
    target.querySelector<HTMLButtonElement>('button[aria-label="Show deployment"]')?.click();

    expect(onDiagramQuickAction).toHaveBeenCalledWith('show-deployment', 'shop/db', {
      left: 0,
      top: 0,
      right: 320,
      bottom: 200
    });
    await unmount(component);
  });

  it('renders a quick-action deployment picker inside the diagram overlay', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(SvgPreviewPanel, {
      target,
      props: {
        svg,
        quickActionMetadata: metadata,
        deploymentEnvironments: [{ id: 'eu' }, { id: 'us' }],
        deploymentPickerOpen: true,
        deploymentPickerAnchor: { left: 100, top: 120, right: 134, bottom: 154 }
      }
    });
    await settle();

    const picker = target.querySelector<HTMLElement>('[aria-label="Select deployment environment"]');
    const pickerPosition = picker?.parentElement;
    expect(pickerPosition?.classList.contains('deployment-picker-position')).toBe(true);
    expect(pickerPosition?.closest('.quick-actions-overlay')).not.toBeNull();
    expect(pickerPosition?.style.left).toBe('8px');
    expect(pickerPosition?.style.top).toBe('120px');
    expect(picker?.style.position).toBe('');

    await unmount(component);
  });

  it('does not mix ordinary selection with Find path result highlights', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(SvgPreviewPanel, {
      target,
      props: {
        svg,
        quickActionMetadata: metadata,
        findPathMode: {
          status: 'showing-path',
          sourceId: 'shop/api',
          sourceTitle: 'API',
          targetId: 'shop/db',
          targetTitle: 'Database'
        }
      }
    });
    await settle();

    const apiGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/api']))}`)!;
    const dbGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/db']))}`)!;
    dbGroup.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

    expect(apiGroup.classList.contains('archinsight-path-source')).toBe(true);
    expect(dbGroup.classList.contains('archinsight-path-target')).toBe(true);
    expect(apiGroup.classList.contains('archinsight-node-selected')).toBe(false);
    expect(dbGroup.classList.contains('archinsight-node-selected')).toBe(false);

    await unmount(component);
  });

  it('highlights the isolated focus with the ordinary selection frame', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(SvgPreviewPanel, {
      target,
      props: {
        svg,
        quickActionMetadata: metadata,
        isolateMode: { status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API' }
      }
    });
    await settle();

    const apiGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/api']))}`)!;
    const dbGroup = target.querySelector<SVGGElement>(`#${CSS.escape(renderIdentity('node', ['shop/db']))}`)!;

    expect(apiGroup.classList.contains('archinsight-node-selected')).toBe(true);
    expect(dbGroup.classList.contains('archinsight-node-selected')).toBe(false);

    await unmount(component);
  });

  it('remeasures and clamps the viewport whenever the rendered SVG changes', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const props = new ReactiveTestProps<{
      svg: string | undefined;
      quickActionMetadata: DiagramQuickActionMetadata;
    }>({ svg, quickActionMetadata: metadata }).value;
    const component = mount(SvgPreviewPanel, {
      target,
      props
    });
    await settle();

    const previewPane = target.querySelector<HTMLElement>('.preview-pane')!;
    const svgHost = target.querySelector<HTMLElement>('.svg-host')!;
    Object.defineProperties(previewPane, {
      clientWidth: { configurable: true, value: 320 },
      clientHeight: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 900 },
      scrollHeight: { configurable: true, value: 700 }
    });
    Object.defineProperties(svgHost, {
      scrollWidth: { configurable: true, value: 320 },
      scrollHeight: { configurable: true, value: 200 }
    });
    previewPane.scrollLeft = 160;
    previewPane.scrollTop = 90;
    props.svg = compactSvg;
    await settle();

    expect(previewPane.style.getPropertyValue('--diagram-width')).toBe('120px');
    expect(previewPane.style.getPropertyValue('--diagram-height')).toBe('80px');
    expect(previewPane.scrollLeft).toBe(0);
    expect(previewPane.scrollTop).toBe(0);
    expect(target.querySelector<HTMLElement>('.quick-actions-overlay')?.style.width).toBe('320px');
    expect(target.querySelector<HTMLElement>('.quick-actions-overlay')?.style.height).toBe('200px');

    await unmount(component);
  });

  it('reconnects quick actions after the SVG host is removed and mounted again', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const props = new ReactiveTestProps<{
      svg: string | undefined;
      quickActionMetadata: DiagramQuickActionMetadata;
    }>({ svg, quickActionMetadata: metadata }).value;
    const component = mount(SvgPreviewPanel, { target, props });
    await settle();
    expect(target.querySelector('button[aria-label="Quick actions for API"]')).not.toBeNull();

    props.svg = undefined;
    await settle();
    expect(target.querySelector('.svg-host')).toBeNull();

    props.svg = svg;
    await settle();
    expect(target.querySelector('button[aria-label="Quick actions for API"]')).not.toBeNull();

    await unmount(component);
  });
});

async function settle(): Promise<void> {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x, y, width, height, top: y, left: x, right: x + width, bottom: y + height,
    toJSON: () => ({ x, y, width, height })
  } as DOMRect;
}
