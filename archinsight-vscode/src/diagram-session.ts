export type DiagramArtifactKind = "source" | "svg" | "png" | "dot";

export interface DiagramQueryState<TView extends string> {
  readonly view: TView;
  readonly query: string;
  readonly environment?: string;
}

export interface DiagramPreviewState<TView extends string> extends DiagramQueryState<TView> {
  readonly fileName: string;
  readonly source: string;
  readonly svg?: string;
  readonly dot?: string;
  readonly error?: string;
}

export interface DiagramEnvironmentSelection {
  readonly environment?: string;
  readonly cancelled: boolean;
}

export interface DiagramRenderRequest<TView extends string> {
  readonly view: TView;
  readonly query: string;
  readonly forceEnvironmentPicker?: boolean;
  readonly requestedEnvironment?: string;
}

export type DiagramRenderStatus = "rendered" | "cancelled" | "unavailable" | "stale";

export interface DiagramSessionPorts<
  TInput,
  TView extends string,
  TState extends DiagramPreviewState<TView>,
> {
  readonly usesEnvironment: (view: TView) => boolean;
  readonly chooseEnvironment: (
    input: TInput,
    selected: string | undefined,
    forcePicker: boolean,
  ) => Promise<DiagramEnvironmentSelection>;
  readonly buildPreview: (input: TInput, state: DiagramQueryState<TView>) => Promise<TState>;
  readonly publishPreview: (state: TState) => Promise<void>;
  readonly publishQuery?: (state: DiagramQueryState<TView>) => Promise<void>;
  readonly onQueryChanged?: (state: DiagramQueryState<TView>) => Promise<void>;
  readonly save: (fileName: string, content: Uint8Array) => Promise<void>;
  readonly warn: (message: string) => void;
  readonly requestPng: (svg: string) => Promise<void>;
  readonly decodePng: (dataUrl: string) => Uint8Array | undefined;
}

export interface DiagramSourceArtifact {
  readonly fileName: string;
  readonly source: string;
}

export class DiagramSession<
  TInput,
  TView extends string,
  TState extends DiagramPreviewState<TView>,
> {
  private readonly ports: DiagramSessionPorts<TInput, TView, TState>;
  private currentQuery: DiagramQueryState<TView>;
  private currentPreview: TState | undefined;
  private generation = 0;
  private disposed = false;
  private pngResolve: ((value: Uint8Array) => void) | undefined;
  private pngReject: ((reason?: unknown) => void) | undefined;

  constructor(
    initialState: DiagramQueryState<TView>,
    ports: DiagramSessionPorts<TInput, TView, TState>,
  ) {
    this.currentQuery = initialState;
    this.ports = ports;
  }

  queryState(): DiagramQueryState<TView> {
    return this.currentQuery;
  }

  previewState(): TState | undefined {
    return this.currentPreview;
  }

  setQueryState(view: TView, query: string): void {
    this.currentQuery = this.withEnvironment(view, query, this.currentQuery.environment);
  }

  async render(input: TInput | undefined, request: DiagramRenderRequest<TView>): Promise<DiagramRenderStatus> {
    return this.renderInput(input, request, true);
  }

  async refresh(input: TInput): Promise<DiagramRenderStatus> {
    return this.renderInput(input, {
      view: this.currentQuery.view,
      query: this.currentQuery.query,
      requestedEnvironment: this.currentQuery.environment,
    }, false);
  }

  async download(kind: DiagramArtifactKind, sourceOverride?: DiagramSourceArtifact): Promise<boolean> {
    if (kind === "source") {
      const source = sourceOverride ?? this.currentPreview;
      if (source === undefined) {
        return false;
      }
      await this.saveText(source.fileName, ".ai", source.source);
      return true;
    }

    const state = this.currentPreview;
    if (state === undefined) {
      this.ports.warn("No rendered diagram is available.");
      return false;
    }
    if (kind === "svg") {
      if (state.svg === undefined) {
        this.ports.warn("No rendered SVG is available.");
        return false;
      }
      await this.saveText(state.fileName, ".svg", state.svg);
      return true;
    }
    if (kind === "dot") {
      if (state.dot === undefined) {
        this.ports.warn("No rendered DOT is available.");
        return false;
      }
      await this.saveText(state.fileName, ".dot", state.dot);
      return true;
    }
    if (state.svg === undefined) {
      this.ports.warn("No rendered diagram is available.");
      return false;
    }
    await this.ports.save(fileNameWithExtension(state.fileName, ".png"), await this.exportPng(state.svg));
    return true;
  }

  resolvePng(dataUrl: string): void {
    const decoded = this.ports.decodePng(dataUrl);
    if (decoded === undefined) {
      this.pngReject?.(new Error("PNG export failed"));
    } else {
      this.pngResolve?.(decoded);
    }
    this.clearPngRequest();
  }

  dispose(reason = "Diagram session closed"): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation++;
    this.pngReject?.(new Error(reason));
    this.clearPngRequest();
  }

  private async renderInput(
    input: TInput | undefined,
    request: DiagramRenderRequest<TView>,
    queryChanged: boolean,
  ): Promise<DiagramRenderStatus> {
    if (this.disposed) {
      return "stale";
    }
    if (input === undefined) {
      if (queryChanged) {
        this.currentQuery = this.withEnvironment(request.view, request.query, this.currentQuery.environment);
        await this.ports.onQueryChanged?.(this.currentQuery);
        await this.ports.publishQuery?.(this.currentQuery);
      }
      return "unavailable";
    }

    let environment = request.requestedEnvironment ?? this.currentQuery.environment;
    if (this.ports.usesEnvironment(request.view)) {
      const selection = await this.ports.chooseEnvironment(
        input,
        environment,
        request.forceEnvironmentPicker === true,
      );
      if (selection.cancelled) {
        if (queryChanged) {
          await this.ports.publishQuery?.(this.currentQuery);
        }
        return "cancelled";
      }
      environment = selection.environment;
    }

    const nextQuery = this.withEnvironment(request.view, request.query, environment);
    const didChange = nextQuery.view !== this.currentQuery.view
      || nextQuery.query !== this.currentQuery.query
      || nextQuery.environment !== this.currentQuery.environment;
    this.currentQuery = nextQuery;
    if (queryChanged && didChange) {
      await this.ports.onQueryChanged?.(nextQuery);
    }

    const generation = ++this.generation;
    const state = await this.ports.buildPreview(input, nextQuery);
    if (this.disposed || generation !== this.generation) {
      return "stale";
    }
    this.currentPreview = state;
    await this.ports.publishPreview(state);
    if (queryChanged) {
      await this.ports.publishQuery?.(nextQuery);
    }
    return "rendered";
  }

  private withEnvironment(view: TView, query: string, environment: string | undefined): DiagramQueryState<TView> {
    return {
      view,
      query,
      ...(environment === undefined ? {} : { environment }),
    };
  }

  private async saveText(fileName: string, extension: string, content: string): Promise<void> {
    await this.ports.save(fileNameWithExtension(fileName, extension), new TextEncoder().encode(content));
  }

  private async exportPng(svg: string): Promise<Uint8Array> {
    this.pngReject?.(new Error("PNG export was superseded"));
    const result = new Promise<Uint8Array>((resolve, reject) => {
      this.pngResolve = resolve;
      this.pngReject = reject;
    });
    try {
      await this.ports.requestPng(svg);
    } catch (error) {
      this.pngReject?.(error);
      this.clearPngRequest();
    }
    return result;
  }

  private clearPngRequest(): void {
    this.pngResolve = undefined;
    this.pngReject = undefined;
  }
}

export function fileNameWithExtension(fileName: string, extension: string): string {
  return fileName.replace(/\.ai$/i, "") + extension;
}
