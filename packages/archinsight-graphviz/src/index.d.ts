export declare const GRAPHVIZ_RENDER_FAILED = "Graphviz render failed";

export interface GraphvizMessage {
  readonly level?: "error" | "warning";
  readonly message: string;
}

export type GraphvizSvgRenderResult =
  | {
      readonly status: "success";
      readonly output: string;
      readonly errors: readonly GraphvizMessage[];
    }
  | {
      readonly status: "failure";
      readonly output?: undefined;
      readonly errors: readonly GraphvizMessage[];
    };

export type NormalizedGraphvizSvgResult =
  | {
      readonly status: "success";
      readonly svg: string;
      readonly warnings: readonly string[];
    }
  | {
      readonly status: "failure";
      readonly error: string;
    };

export declare function normalizeGraphvizSvgResult(
  result: GraphvizSvgRenderResult
): NormalizedGraphvizSvgResult;
