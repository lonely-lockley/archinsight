import type {
  OperatorImplementationRegistry,
  OperatorImplementationV1,
} from "./contracts.js";

export const CORE_EDGE_IMPLEMENTATION = "@insight/core.edge";
export const CORE_ELEMENT_IMPLEMENTATION = "@insight/core.element";

export type OperatorImplementationEntry = readonly [string, OperatorImplementationV1];

export class ImmutableOperatorImplementationRegistry implements OperatorImplementationRegistry {
  private readonly implementations: ReadonlyMap<string, OperatorImplementationV1>;

  constructor(entries: Iterable<OperatorImplementationEntry> = []) {
    const implementations = new Map<string, OperatorImplementationV1>();
    for (const [id, implementation] of entries) {
      if (id.length === 0) {
        throw new Error("Operator implementation id must not be empty");
      }
      if (implementation.apiVersion !== "insight.operator.v1") {
        throw new Error(`Unsupported operator implementation API '${implementation.apiVersion}' for '${id}'`);
      }
      if (implementations.has(id)) {
        throw new Error(`Duplicate operator implementation '${id}'`);
      }
      implementations.set(id, implementation);
    }
    this.implementations = implementations;
  }

  resolve(id: string): OperatorImplementationV1 | undefined {
    return this.implementations.get(id);
  }

  with(id: string, implementation: OperatorImplementationV1): ImmutableOperatorImplementationRegistry {
    return new ImmutableOperatorImplementationRegistry([...this.implementations, [id, implementation]]);
  }
}

export const coreOperatorImplementationRegistry = new ImmutableOperatorImplementationRegistry([
  [CORE_EDGE_IMPLEMENTATION, {
    apiVersion: "insight.operator.v1",
    invoke: ({ invocation }) => ({
      edges: invocation.edge === undefined ? [] : [invocation.edge],
    }),
  }],
  [CORE_ELEMENT_IMPLEMENTATION, {
    apiVersion: "insight.operator.v1",
    invoke: () => ({}),
  }],
]);

export function createOperatorImplementationRegistry(
  entries: Iterable<OperatorImplementationEntry> = [],
): ImmutableOperatorImplementationRegistry {
  return new ImmutableOperatorImplementationRegistry(entries);
}
