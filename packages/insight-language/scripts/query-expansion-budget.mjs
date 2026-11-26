// The smallest accepted maxExpansions is the engine's exact operation count.
export function minimumExpansionBudget(run, upper) {
  run(upper);
  let lower = 1;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper) / 2);
    try {
      run(candidate);
      upper = candidate;
    } catch (error) {
      if (!/AIQ_BUDGET_EXCEEDED.*maxExpansions/.test(String(error))) throw error;
      lower = candidate + 1;
    }
  }
  return lower;
}
