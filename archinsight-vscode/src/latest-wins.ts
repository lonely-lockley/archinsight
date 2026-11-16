export interface LatestWinsOperation {
  readonly generation: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}

/** Coordinates asynchronous work whose older results must never replace newer state. */
export class LatestWinsCoordinator {
  private generation = 0;
  private disposed = false;
  private currentAbort: AbortController | undefined;

  begin(): LatestWinsOperation {
    this.currentAbort?.abort();
    const abort = new AbortController();
    this.currentAbort = abort;
    const generation = ++this.generation;
    return {
      generation,
      signal: abort.signal,
      isCurrent: () => !this.disposed && generation === this.generation,
    };
  }

  cancel(): void {
    this.generation++;
    this.currentAbort?.abort();
    this.currentAbort = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
  }
}
