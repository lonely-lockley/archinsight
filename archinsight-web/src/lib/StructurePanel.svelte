<script lang="ts">
  import 'monaco-editor/editor/contrib/symbolIcons/browser/symbolIcons.js';
  import {
    buildTypeHierarchy,
    filterTypeHierarchy,
    type LanguageSnapshot,
    type TypeHierarchyNode
  } from '@insight/language';
  import type { ProjectStructure, StructureDeclaration } from './api';
  import StructureTreeNode from './StructureTreeNode.svelte';
  import type { SourceLocation, StructureTreeNodeModel } from './workspace-types';

  export let symbols: LanguageSnapshot;
  export let structure: ProjectStructure | undefined;
  export let loading = false;
  export let onOpenDeclaration: (declaration: SourceLocation) => void;

  let search = '';
  let showLanguageTypes = false;
  let showOperators = false;
  let showIdentifiers = true;

  $: query = search.trim().toLowerCase();
  $: typeTree = filterNodes(buildTypeTree(symbols, showLanguageTypes, showOperators), query);
  $: declarationTree = showIdentifiers ? filterNodes(buildDeclarationTree(structure), query) : [];
  $: hasMatches = typeTree.length > 0 || declarationTree.length > 0;

  function buildTypeTree(
    snapshot: LanguageSnapshot,
    includeLanguageTypes: boolean,
    includeOperators: boolean
  ): StructureTreeNodeModel[] {
    return filterTypeHierarchy(buildTypeHierarchy(snapshot), {
      includeLanguageTypes,
      includeOperators
    }).map((type) => typeNode(type, true));
  }

  function typeNode(
    type: TypeHierarchyNode,
    root: boolean
  ): StructureTreeNodeModel {
    return {
      id: `type:${type.id}`,
      label: type.id,
      kind: type.operator ? (root ? 'operator-root' : 'operator') : (root ? 'type-root' : 'type'),
      icon: type.operator ? 'symbol-operator' : 'symbol-class',
      ...(type.extends === undefined ? {} : { meta: `extends ${type.extends}` }),
      ...(type.declaration === undefined ? {} : {
        declaration: type.declaration
      }),
      children: type.children.map((child) => typeNode(child, false))
    };
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

  <div class="structure-filters" aria-label="Structure filters">
    <button
      aria-label="Show language types"
      aria-pressed={showLanguageTypes}
      class:active={showLanguageTypes}
      class="structure-filter"
      title="Show language types"
      type="button"
      on:click={() => showLanguageTypes = !showLanguageTypes}
    >
      <span aria-hidden="true" class="codicon codicon-symbol-class"></span>
    </button>
    <button
      aria-label="Show operators"
      aria-pressed={showOperators}
      class:active={showOperators}
      class="structure-filter"
      title="Show operators"
      type="button"
      on:click={() => showOperators = !showOperators}
    >
      <span aria-hidden="true" class="codicon codicon-symbol-operator"></span>
    </button>
    <button
      aria-label="Show declared identifiers"
      aria-pressed={showIdentifiers}
      class:active={showIdentifiers}
      class="structure-filter"
      title="Show declared identifiers"
      type="button"
      on:click={() => showIdentifiers = !showIdentifiers}
    >
      <span aria-hidden="true" class="codicon codicon-symbol-variable"></span>
    </button>
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
    grid-template-rows: auto auto minmax(0, 1fr);
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

  .structure-filters {
    display: flex;
    gap: 5px;
    padding: 0 10px 8px;
  }

  .structure-filter {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    padding: 0;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    background: #252525;
    color: #8d8d8d;
    font-size: 15px;
  }

  .structure-filter:hover,
  .structure-filter:focus-visible {
    border-color: #5a5a5a;
    background: #343434;
    color: #eeeeee;
    outline: none;
  }

  .structure-filter.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 20%, #252525);
    color: #eeeeee;
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
