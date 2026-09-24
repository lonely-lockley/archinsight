export type QueryScopeVariable = 'tab' | 'context';
export type QueryScopeChoice = { readonly value: string; readonly label: string; readonly typeName?: string };
export type QueryScopeContextChoice = QueryScopeChoice & { readonly sourceIdentity: string };
export type QueryScopeSelection = { readonly tab?: string; readonly context?: string };
export type QueryScopeWidgetState = {
  readonly enabled: boolean;
  readonly tab?: string;
  readonly context?: string;
  readonly sources: readonly QueryScopeChoice[];
  readonly contexts: readonly QueryScopeChoice[];
};

export function resolveQueryScopeState(
  enabled: boolean,
  sourceChoices: readonly QueryScopeChoice[],
  contextChoices: readonly QueryScopeContextChoice[],
  selection: QueryScopeSelection
): QueryScopeWidgetState {
  const sources = [...sourceChoices].sort((left, right) => left.value.localeCompare(right.value));
  const contexts = [...new Map(contextChoices.map((choice) => [choice.value, choice])).values()]
    .map(({ sourceIdentity: _, ...choice }) => choice)
    .sort((left, right) => left.value.localeCompare(right.value));
  const tab = sources.some((choice) => choice.value === selection.tab) ? selection.tab : undefined;
  const inferredContext = contextChoices.find((choice) => choice.sourceIdentity === tab)?.value;
  const context = tab === undefined && contexts.some((choice) => choice.value === selection.context)
    ? selection.context
    : inferredContext;
  return { enabled, tab, context, sources, contexts };
}

export function selectQueryScope(
  state: QueryScopeWidgetState,
  contextChoices: readonly QueryScopeContextChoice[],
  selection: QueryScopeSelection,
  variable: QueryScopeVariable,
  value: string
): QueryScopeSelection | undefined {
  const choices = variable === 'tab' ? state.sources : state.contexts;
  if (!state.enabled || !choices.some((choice) => choice.value === value)) return undefined;
  if (variable === 'tab') return { tab: value };
  const sourceContext = contextChoices.find((choice) => choice.sourceIdentity === state.tab)?.value;
  return { ...(sourceContext === value ? { tab: selection.tab } : {}), context: value };
}
