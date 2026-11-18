import {
  idleDeploymentMode,
  idleFindPathMode,
  idleIsolateMode,
  clearTransientDiagramResult,
  idleTransientDiagramResult,
  showTransientDiagramResult,
  type DeploymentMode,
  type DiagramQuickActionResultMode,
  type FindPathMode,
  type IsolateMode,
  type TransientDiagramResultKind,
  type TransientDiagramResultState
} from './diagram-quick-actions.js';

export interface DiagramActionOwner {
  readonly id?: string;
  readonly sourceIdentity?: string;
}

export interface DiagramActionLifecycle extends DiagramActionOwner {
  readonly kind: TransientDiagramResultKind;
}

export interface DiagramQuickActionStackFrame<TSnapshot, TProjection> {
  readonly mode: DiagramQuickActionResultMode;
  readonly snapshot: TSnapshot;
  readonly projection: TProjection;
}

/** Host-neutral LIFO history for composable diagram quick-action results. */
export class DiagramQuickActionStack<TSnapshot, TProjection> {
  private readonly frames: DiagramQuickActionStackFrame<TSnapshot, TProjection>[] = [];

  push(frame: DiagramQuickActionStackFrame<TSnapshot, TProjection>): void {
    this.frames.push(frame);
  }

  currentMode(): DiagramQuickActionResultMode | undefined {
    return this.frames.at(-1)?.mode;
  }

  currentProjection(): TProjection | undefined {
    return this.frames.at(-1)?.projection;
  }

  currentSnapshot(): TSnapshot | undefined {
    return this.frames.at(-1)?.snapshot;
  }

  replaceCurrent(mode: DiagramQuickActionResultMode, projection: TProjection): boolean {
    const current = this.frames.at(-1);
    if (current === undefined) return false;
    this.frames[this.frames.length - 1] = { ...current, mode, projection };
    return true;
  }

  pop(): { readonly snapshot: TSnapshot; readonly mode: DiagramQuickActionResultMode | undefined } | undefined {
    const frame = this.frames.pop();
    return frame === undefined ? undefined : { snapshot: frame.snapshot, mode: this.currentMode() };
  }

  clear(): TSnapshot | undefined {
    const baseline = this.frames[0]?.snapshot;
    this.frames.length = 0;
    return baseline;
  }

  clearFrames(): readonly DiagramQuickActionStackFrame<TSnapshot, TProjection>[] {
    return this.frames.splice(0);
  }

  depth(): number {
    return this.frames.length;
  }
}

/** Host-neutral mode, owner, baseline, result, and stale-generation lifecycle. */
export class DiagramQuickActionCoordinator {
  private readonly actions = new Map<TransientDiagramResultKind, DiagramActionLifecycle>();
  private generation = 0;
  private result: TransientDiagramResultState = idleTransientDiagramResult;
  private findPath: FindPathMode = idleFindPathMode;
  private isolate: IsolateMode = idleIsolateMode;
  private deployment: DeploymentMode = idleDeploymentMode;

  findPathMode(): FindPathMode {
    return this.findPath;
  }

  setFindPathMode(mode: FindPathMode): void {
    this.findPath = mode;
  }

  isolateMode(): IsolateMode {
    return this.isolate;
  }

  setIsolateMode(mode: IsolateMode): void {
    this.isolate = mode;
  }

  deploymentMode(): DeploymentMode {
    return this.deployment;
  }

  setDeploymentMode(mode: DeploymentMode): void {
    this.deployment = mode;
  }

  nextGeneration(): number {
    return ++this.generation;
  }

  invalidate(): void {
    this.generation++;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  resultState(): TransientDiagramResultState {
    return this.result;
  }

  showResult(kind: TransientDiagramResultKind): void {
    this.result = showTransientDiagramResult(kind);
  }

  clearResult(): void {
    this.result = clearTransientDiagramResult();
  }

  begin(kind: TransientDiagramResultKind, owner: DiagramActionOwner): void {
    this.actions.set(kind, {
      kind,
      ...owner,
    });
  }

  lifecycle(kind: TransientDiagramResultKind): DiagramActionLifecycle | undefined {
    return this.actions.get(kind);
  }

  clear(kind: TransientDiagramResultKind): void {
    this.actions.delete(kind);
  }

  owns(kind: TransientDiagramResultKind, ownerId: string | undefined): boolean {
    const owner = this.actions.get(kind)?.id;
    return owner === undefined || owner === ownerId;
  }

  belongsToSource(kind: TransientDiagramResultKind, sourceIdentity: string): boolean {
    const owner = this.actions.get(kind)?.sourceIdentity;
    return owner === undefined || owner === sourceIdentity;
  }

  reset(): void {
    this.actions.clear();
    this.findPath = idleFindPathMode;
    this.isolate = idleIsolateMode;
    this.deployment = idleDeploymentMode;
    this.clearResult();
    this.invalidate();
  }
}
