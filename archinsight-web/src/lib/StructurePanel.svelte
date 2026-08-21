<script lang="ts">
  import 'monaco-editor/editor/contrib/symbolIcons/browser/symbolIcons.js';
  import type { LanguageSnapshot, TypeDefinition } from '@insight/language';
  import type { ProjectStructure, StructureDeclaration } from './api';
  import StructureTreeNode from './StructureTreeNode.svelte';
  import type { SourceLocation, StructureTreeNodeModel } from './workspace-types';

  export let symbols: LanguageSnapshot;
  export let structure: ProjectStructure | undefined;
  export let loading = false;
  export let onOpenDeclaration: (declaration: SourceLocation) => void;

  const hiddenStructureTypes = new Set(['List', 'Nothing', 'Text', 'text']);

  let search = '';

  $: query = search.trim().toLowerCase();
  $: typeTree = filterNodes(buildTypeTree(symbols), query);
  $: declarationTree = filterNodes(buildDeclarationTree(structure), query);
  $: hasMatches = typeTree.length > 0 || declarationTree.length > 0;

  function buildTypeTree(snapshot: LanguageSnapshot): StructureTreeNodeModel[] {
    const types = snapshot.types
      .filter((type) => !hiddenStructureTypes.has(type.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    const typeByName = new Map(types.map((type) => [type.name, type]));
    const operatorTypes = new Set(snapshot.operators.map((operator) => operator.ownerType));
    const childrenByBase = new Map<string, TypeDefinition[]>();
    const knownTypes = new Set(types.map((type) => type.name));

    for (const type of types) {
      if (type.baseType === undefined || !knownTypes.has(type.baseType)) {
        continue;
      }
      const children = childrenByBase.get(type.baseType) ?? [];
      children.push(type);
      childrenByBase.set(type.baseType, children);
    }

    const roots = types.filter((type) => type.baseType === undefined || !knownTypes.has(type.baseType));
    return roots.map((type) => typeNode(type, childrenByBase, typeByName, operatorTypes, true));
  }

  function typeNode(
    type: TypeDefinition,
    childrenByBase: Map<string, TypeDefinition[]>,
    typeByName: Map<string, TypeDefinition>,
    operatorTypes: Set<string>,
    root: boolean
  ): StructureTreeNodeModel {
    const operator = isOperatorType(type, typeByName, operatorTypes);
    return {
      id: `type:${type.name}`,
      label: type.name,
      kind: operator ? (root ? 'operator-root' : 'operator') : (root ? 'type-root' : 'type'),
      icon: operator ? 'symbol-operator' : 'symbol-class',
      ...(type.baseType === undefined ? {} : { meta: `extends ${type.baseType}` }),
      ...(type.declaration === undefined ? {} : {
        declaration: {
          source: type.declaration.sourceName,
          line: type.declaration.line,
          column: type.declaration.column
        }
      }),
      children: (childrenByBase.get(type.name) ?? []).map((child) => typeNode(child, childrenByBase, typeByName, operatorTypes, false))
    };
  }

  function isOperatorType(
    type: TypeDefinition,
    typeByName: Map<string, TypeDefinition>,
    operatorTypes: Set<string>
  ): boolean {
    let current: TypeDefinition | undefined = type;
    while (current !== undefined) {
      if (operatorTypes.has(current.name)) {
        return true;
      }
      current = current.baseType === undefined ? undefined : typeByName.get(current.baseType);
    }
    return false;
  }

  function buildDeclarationTree(projectStructure: ProjectStructure | undefined): StructureTreeNodeModel[] {
    return (projectStructure?.contexts ?? []).map((context) => declarationNode(context, 'context'));
  }

  function declarationNode(
    declaration: StructureDeclaration,
    fallbackKind: StructureTreeNodeModel['kind']
  ): StructureTreeNodeModel {
    const kind = declaration.kind === 'context'
      ? 'context'
      : declaration.kind === 'import'
        ? 'import'
        : declaration.kind === 'element'
          ? 'element'
          : fallbackKind;
    return {
      id: `${kind}:${declaration.source}:${declaration.line}:${declaration.column}:${declaration.id}`,
      label: declaration.id,
      kind,
      icon: declarationIcon(kind),
      meta: declaration.constructor,
      declaration: {
        source: declaration.source,
        line: declaration.line,
        column: declaration.column
      },
      children: declaration.children.map((child) => declarationNode(child, 'element'))
    };
  }

  function declarationIcon(kind: StructureTreeNodeModel['kind']): string {
    if (kind === 'context') {
      return 'symbol-namespace';
    }
    if (kind === 'import') {
      return 'symbol-reference';
    }
    return 'symbol-variable';
  }

  function filterNodes(nodes: StructureTreeNodeModel[], value: string): StructureTreeNodeModel[] {
    if (value.length === 0) {
      return nodes;
    }
    return nodes.flatMap((node) => filterNode(node, value));
  }

  function filterNode(node: StructureTreeNodeModel, value: string): StructureTreeNodeModel[] {
    if (searchText(node).includes(value)) {
      return [node];
    }
    const children = filterNodes(node.children, value);
    return children.length === 0 ? [] : [{ ...node, children }];
  }

  function searchText(node: StructureTreeNodeModel): string {
    return `${node.label} ${node.kind} ${node.meta ?? ''} ${node.declaration?.source ?? ''}`.toLowerCase();
  }
</script>

<section class="structure-panel monaco-workbench">
  <div class="search-box" aria-label="Search structure">
    <span aria-hidden="true" class="codicon codicon-search"></span>
    <input bind:value={search} type="search" placeholder="Search" spellcheck="false" />
    {#if search.length > 0}
      <button aria-label="Clear search" class="clear-search" type="button" on:click={() => search = ''}>
        <span aria-hidden="true" class="codicon codicon-close"></span>
      </button>
    {/if}
  </div>

  <div class="structure-content">
    {#if loading && structure === undefined}
      <div class="empty">Analyzing project…</div>
    {:else if hasMatches}
      {#if typeTree.length > 0}
        <div class="section-title">Types</div>
        {#each typeTree as node (node.id)}
          <StructureTreeNode {node} {onOpenDeclaration} />
        {/each}
      {/if}

      {#if declarationTree.length > 0}
        <div class="section-title">Objects</div>
        {#each declarationTree as node (node.id)}
          <StructureTreeNode {node} {onOpenDeclaration} />
        {/each}
      {/if}
    {:else}
      <div class="empty">No declarations</div>
    {/if}
  </div>
</section>

<style>
  .codicon-search::before {
    content: "\ea6d";
  }

  .codicon-close::before {
    content: "\ea76";
  }

  .structure-panel {
    --vscode-symbolIcon-classForeground: #EE9D28;
    --vscode-symbolIcon-variableForeground: #75BEFF;
    --vscode-symbolIcon-namespaceForeground: #d2d2d2;
    --vscode-symbolIcon-operatorForeground: #d2d2d2;
    --vscode-symbolIcon-referenceForeground: #d2d2d2;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    min-width: 0;
  }

  .search-box {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) 22px;
    align-items: center;
    gap: 8px;
    margin: 10px 10px 8px;
    padding: 0 7px 0 9px;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #252525;
    color: #9a9a9a;
  }

  .search-box:focus-within {
    border-color: var(--color-primary);
    color: #d8d8d8;
  }

  input {
    width: 100%;
    height: 30px;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #eeeeee;
    font: inherit;
    font-size: 13px;
  }

  input::placeholder {
    color: #808080;
  }

  .clear-search {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #9a9a9a;
    line-height: 1;
  }

  .clear-search .codicon {
    display: grid;
    width: 14px;
    height: 14px;
    place-items: center;
    font-size: 12px;
    line-height: 1;
  }

  .clear-search:hover,
  .clear-search:focus-visible {
    background: #343434;
    color: #eeeeee;
    outline: none;
  }

  .structure-content {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding-bottom: 8px;
  }

  .section-title {
    padding: 12px 10px 5px;
    color: #8d8d8d;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .empty {
    padding: 24px;
    color: #9a9a9a;
  }
</style>
