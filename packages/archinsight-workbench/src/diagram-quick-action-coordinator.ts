import {
  idleDeploymentMode,
  idleFindPathMode,
  idleIsolateMode,
  clearTransientDiagramResult,
  idleTransientDiagramResult,
  showTransientDiagramResult,
  type DeploymentMode,
  type FindPathMode,
  type IsolateMode,
  type TransientDiagramResultKind,
  type TransientDiagramResultState
} from './diagram-quick-actions.js';

export interface DiagramActionOwner {
  readonly id?: string;
  readonly sourceIdentity?: string;
}

export interface DiagramActionLifecycle<TBaseline> extends DiagramActionOwner {
  readonly kind: TransientDiagramResultKind;
  readonly baseline?: TBaseline;
}

/** Host-neutral mode, owner, baseline, result, and stale-generation lifecycle. */
export class DiagramQuickActionCoordinator<TBaseline> {
  private readonly actions = new Map<TransientDiagramResultKind, DiagramActionLifecycle<TBaseline>>();
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

  begin(kind: TransientDiagramResultKind, owner: DiagramActionOwner, baseline?: TBaseline): void {
    const retainedBaseline = baseline ?? this.actions.get(kind)?.baseline;
    this.actions.set(kind, {
      kind,
      ...owner,
      ...(retainedBaseline === undefined ? {} : { baseline: retainedBaseline }),
    });
  }

  setBaseline(kind: TransientDiagramResultKind, baseline: TBaseline): void {
    const current = this.actions.get(kind) ?? { kind };
    this.actions.set(kind, { ...current, baseline });
  }

  lifecycle(kind: TransientDiagramResultKind): DiagramActionLifecycle<TBaseline> | undefined {
    return this.actions.get(kind);
  }

  takeBaseline(kind: TransientDiagramResultKind): TBaseline | undefined {
    const current = this.actions.get(kind);
    if (current?.baseline === undefined) return undefined;
    this.actions.set(kind, { kind, id: current.id, sourceIdentity: current.sourceIdentity });
    return current.baseline;
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
