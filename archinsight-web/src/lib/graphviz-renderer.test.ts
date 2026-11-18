// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  instances: [] as Array<{
    terminated: boolean;
    messages: Array<{ requestId: number }>;
    onmessage: ((event: MessageEvent) => void) | null;
  }>
}));

vi.mock('$lib/graphviz.worker?worker', () => ({
  default: class FakeGraphvizWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminated = false;
    messages: Array<{ requestId: number }> = [];

    constructor() {
      workerState.instances.push(this);
    }

    postMessage(message: { requestId: number }): void {
      this.messages.push(message);
    }

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

  it('serializes renders so a timeout only fails the active request', async () => {
    vi.useFakeTimers();
    const first = renderDotInBrowser([{ sourceIdentity: 'first.ai', diagram: 'query', dot: 'digraph first {}' }]);
    const second = renderDotInBrowser([{ sourceIdentity: 'second.ai', diagram: 'query', dot: 'digraph second {}' }]);
    const firstFailure = expect(first).rejects.toThrow('timed out');

    expect(workerState.instances[0].messages).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await firstFailure;
    expect(workerState.instances[0].terminated).toBe(true);
    expect(workerState.instances).toHaveLength(2);
    const secondRequest = workerState.instances[1].messages[0];
    workerState.instances[1].onmessage?.({
      data: { requestId: secondRequest.requestId, svgs: [{ sourceIdentity: 'second.ai', diagram: 'query', svg: '<svg/>' }] }
    } as MessageEvent);
    await expect(second).resolves.toMatchObject({ svgs: [{ sourceIdentity: 'second.ai' }] });
  });

  it('cancels queued and active renders through AbortSignal', async () => {
    const activeController = new AbortController();
    const queuedController = new AbortController();
    const active = renderDotInBrowser(
      [{ sourceIdentity: 'active.ai', diagram: 'query', dot: 'digraph active {}' }],
      activeController.signal
    );
    const queued = renderDotInBrowser(
      [{ sourceIdentity: 'queued.ai', diagram: 'query', dot: 'digraph queued {}' }],
      queuedController.signal
    );
    const queuedFailure = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    queuedController.abort();
    await queuedFailure;
    expect(workerState.instances[0].terminated).toBe(false);

    const activeFailure = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    activeController.abort();
    await activeFailure;
    expect(workerState.instances[0].terminated).toBe(false);

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(renderDotInBrowser(
      [{ sourceIdentity: 'never.ai', diagram: 'query', dot: 'digraph never {}' }],
      alreadyAborted.signal
    )).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps the worker warm and runs the newest request after a cancelled render finishes', async () => {
    const controller = new AbortController();
    const cancelled = renderDotInBrowser(
      [{ sourceIdentity: 'cancelled.ai', diagram: 'query', dot: 'digraph cancelled {}' }],
      controller.signal
    );
    const next = renderDotInBrowser([
      { sourceIdentity: 'next.ai', diagram: 'query', dot: 'digraph next {}' }
    ]);

    const cancellation = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancellation;
    expect(workerState.instances).toHaveLength(1);
    expect(workerState.instances[0].terminated).toBe(false);
    expect(workerState.instances[0].messages).toHaveLength(1);

    const firstRequest = workerState.instances[0].messages[0];
    workerState.instances[0].onmessage?.({
      data: { requestId: firstRequest.requestId, svgs: [] }
    } as MessageEvent);
    expect(workerState.instances[0].messages).toHaveLength(2);

    const nextRequest = workerState.instances[0].messages[1];
    workerState.instances[0].onmessage?.({
      data: { requestId: nextRequest.requestId, svgs: [{ sourceIdentity: 'next.ai', diagram: 'query', svg: '<svg/>' }] }
    } as MessageEvent);
    await expect(next).resolves.toMatchObject({ svgs: [{ sourceIdentity: 'next.ai' }] });
  });
});
