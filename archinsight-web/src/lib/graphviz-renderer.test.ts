// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  instances: [] as Array<{ terminated: boolean }>
}));

vi.mock('$lib/graphviz.worker?worker', () => ({
  default: class FakeGraphvizWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminated = false;

    constructor() {
      workerState.instances.push(this);
    }

    postMessage(): void {}

    terminate(): void {
      this.terminated = true;
    }
  }
}));

import { renderDotInBrowser, terminateBrowserGraphvizWorker } from './graphviz-renderer';

describe('browser Graphviz worker lifecycle', () => {
  afterEach(() => {
    terminateBrowserGraphvizWorker();
    workerState.instances.length = 0;
    vi.useRealTimers();
  });

  it('terminates a timed-out worker before allowing a fallback render', async () => {
    vi.useFakeTimers();
    const rendering = renderDotInBrowser([{
      sourceIdentity: 'app.ai',
      diagram: 'query',
      dot: 'digraph app { a -> b }'
    }]);
    const rejection = expect(rendering).rejects.toThrow('Browser Graphviz render timed out');

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(workerState.instances[0].terminated).toBe(true);

    void renderDotInBrowser([{
      sourceIdentity: 'next.ai',
      diagram: 'query',
      dot: 'digraph next {}'
    }]).catch(() => undefined);
    expect(workerState.instances).toHaveLength(2);
  });
});
