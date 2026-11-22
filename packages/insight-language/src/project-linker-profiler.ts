export interface ProjectLinkerProfiler {
  measure<T>(phase: string, operation: () => T): T;
}

export function measureLinkPhase<T>(
  profiler: ProjectLinkerProfiler | undefined,
  phase: string,
  operation: () => T,
): T {
  return profiler === undefined ? operation() : profiler.measure(phase, operation);
}
