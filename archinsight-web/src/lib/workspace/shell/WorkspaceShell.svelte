<script lang="ts">
  import { tick } from 'svelte';
  import AuthMenu from '$lib/AuthMenu.svelte';
  import ProjectNavigationPanel from '$lib/ProjectNavigationPanel.svelte';
  import WorkspaceEditor from '$lib/WorkspaceEditor.svelte';
  import WorkspaceToolbar from '$lib/WorkspaceToolbar.svelte';
  import { defaultDiagramMode, defaultQuery } from '$lib/diagram-query-presets';
  import ProjectDialog from '$lib/workspace/projects/ProjectDialog.svelte';
  import RepositoryContextMenu from '$lib/workspace/repository/RepositoryContextMenu.svelte';
  import RepositoryDeleteDialog from '$lib/workspace/repository/RepositoryDeleteDialog.svelte';
  import RepositoryFileDialog from '$lib/workspace/repository/RepositoryFileDialog.svelte';
  import {
    clamp,
    collapsedSidebarWidth,
    minMessagesHeight,
    minSidebarWidth
  } from '$lib/workspace/shell/layout-model';
  import WorkspaceTabs from '$lib/workspace/shell/WorkspaceTabs.svelte';
  import type { MessageView, TreeNode } from '$lib/workspace-types';
  import type {
    WorkspaceShellControllers,
    WorkspaceShellView
  } from '$lib/workspace/shell/workspace-shell-model';

  export let view: WorkspaceShellView;
  export let controllers: WorkspaceShellControllers;
  export let editorHost: HTMLDivElement;
  export let onOpenRepositoryMenu: (node: TreeNode, event: MouseEvent) => void;
  export let onCloseRepositoryMenu: () => void;

  let messagesPanel: HTMLElement;
  let lastAutoScrolledMessagesSignature = '';

  $: sidebarVisible = view.state.projectUi.sidebarVisible;
  $: workspaceStyle = `grid-template-columns: ${sidebarVisible ? clamp(view.state.projectUi.sidebarWidth, minSidebarWidth, 720) : collapsedSidebarWidth}px minmax(0, 1fr);`;
  $: workAreaStyle = view.state.projectUi.messagesVisible
    ? `grid-template-rows: minmax(0, 1fr) 6px ${clamp(view.state.projectUi.messagesHeight, minMessagesHeight, 520)}px;`
    : 'grid-template-rows: minmax(0, 1fr) 0 0;';
  $: tabsRightPadding = view.surface === 'playground'
    ? view.state.currentUser.authenticated ? 120 : 190
    : 44;
  $: scrollMessagesToEnd(view.state.systemMessages, view.state.projectUi.messagesVisible);

  function scrollMessagesToEnd(messages: MessageView[], visible: boolean): void {
    const signature = messages.map((message) => `${message.id}:${message.message}`).join('|');
    if (!visible || signature === lastAutoScrolledMessagesSignature) return;
    lastAutoScrolledMessagesSignature = signature;
    void tick().then(() => {
      if (messagesPanel !== undefined) messagesPanel.scrollTop = messagesPanel.scrollHeight;
    });
  }
</script>

<main class="workspace" style={workspaceStyle}>
  <ProjectNavigationPanel
    tree={view.state.tree}
    hasActiveProject={view.state.activeProjectId !== undefined}
    symbols={view.state.editorSymbols}
    structure={view.state.projectStructure}
    structureLoading={view.state.analysisLoading}
    activePath={view.activeTab?.filePath}
    errorPaths={view.errorSourceIdentities}
    ui={view.state.projectUi}
    visible={sidebarVisible}
    onOpen={(path) => void controllers.file.openFile(path)}
    onRepositoryContextMenu={onOpenRepositoryMenu}
    onOpenDeclaration={(declaration) => void controllers.file.goToDeclaration(declaration)}
    onShowSidebar={controllers.layout.showSidebar}
    onToggleSidebar={controllers.layout.toggleSidebar}
    onToggleMessages={controllers.layout.toggleMessages}
    onBeginSidebarResize={controllers.layout.beginSidebarResize}
  />

  <section class="main">
    <div class="auth-menu-host">
      {#if view.surface === 'editor'}
        <AuthMenu
          user={view.state.currentUser}
          onLogin={controllers.auth.login}
          onManageProjects={controllers.action.manageProjects}
          onLogout={() => void controllers.auth.logout()}
        />
      {:else}
        <nav class="playground-auth" aria-label="Account">
          {#if view.state.currentUser.authenticated}
            <a class="go-to-editor" href={view.editorHref}>Switch to Editor</a>
          {:else}
            <a href={view.loginHref}>Sign In</a>
            <a class="sign-up" href={view.loginHref}>Sign Up</a>
          {/if}
        </nav>
      {/if}
    </div>
    <WorkspaceTabs
      tabs={view.state.tabs}
      activeTabId={view.state.activeTabId}
      errorSourceIdentities={view.errorSourceIdentities}
      rightPadding={tabsRightPadding}
      onActivate={(tabId) => void controllers.file.activateTab(tabId)}
      onClose={controllers.file.closeTab}
    />

    <WorkspaceEditor
      active={view.activeTab !== undefined}
      svg={view.activeTab?.svg}
      diagramMode={view.activeTab?.diagramMode ?? defaultDiagramMode}
      query={view.activeTab?.query ?? defaultQuery}
      deploymentEnvironments={view.activeDeploymentEnvironments}
      deploymentEnvironment={view.activeTab?.deploymentEnvironment}
      deploymentPickerOpen={view.state.deploymentPickerOpen}
      queryVisible={view.activeTab?.queryVisible ?? false}
      queryPanelHeight={view.activeTab?.queryPanelHeight ?? 118}
      viewMode={view.activeTab?.viewMode ?? 'split'}
      diagramScale={view.activeTab?.diagramScale ?? 1}
      diagramFit={view.activeTab?.diagramFit ?? false}
      editorSplitRatio={view.activeTab?.editorSplitRatio ?? 50}
      messages={view.state.systemMessages}
      messagesVisible={view.state.projectUi.messagesVisible}
      {workAreaStyle}
      bind:editorHost
      bind:messagesPanel
      refreshDisabled={view.state.refreshDisabled}
      emptyStrategy={view.emptyStrategy}
      onEmptyAction={controllers.action.handleEmptyAction}
      onSelectDiagramMode={controllers.diagram.selectMode}
      onSelectDeploymentEnvironment={controllers.diagram.selectDeploymentEnvironment}
      onCloseDeploymentPicker={controllers.diagram.closeDeploymentPicker}
      onToggleQuery={controllers.diagram.toggleQuery}
      onQueryChange={controllers.diagram.updateQuery}
      onQueryPanelHeightChange={controllers.diagram.updateQueryPanelHeight}
      onZoomIn={() => controllers.diagram.zoom(0.06)}
      onZoomOut={() => controllers.diagram.zoom(-0.06)}
      onFitDiagram={controllers.diagram.fit}
      onActualSize={controllers.diagram.actualSize}
      onSelectViewMode={controllers.diagram.selectViewMode}
      onRefresh={controllers.diagram.refresh}
      onEditorSplitRatioChange={controllers.diagram.updateEditorSplitRatio}
      onDiagramVisibleScaleChange={controllers.diagram.updateVisibleScale}
      onOpenDeclaration={controllers.file.goToDeclaration}
      onBeginMessagesResize={controllers.layout.beginMessagesResize}
    >
      <WorkspaceToolbar
        slot="leading-actions"
        onNewFile={() => void controllers.file.newFile()}
        onSave={() => void controllers.file.saveActiveTab()}
        onDownloadSource={controllers.download.source}
        onDownloadSvg={controllers.download.svg}
        onDownloadPng={() => void controllers.download.png()}
        onDownloadDot={controllers.download.dot}
        canDownloadSvg={view.canDownloadCurrentDiagram}
        canDownloadPng={view.canDownloadCurrentDiagram}
        canDownloadDot={view.activeTab?.dot !== undefined}
        newFileState={view.newTabState}
        saveState={view.saveState}
      />
    </WorkspaceEditor>
  </section>
</main>

{#if view.state.repositoryMenu !== undefined}
  <RepositoryContextMenu
    menu={view.state.repositoryMenu}
    actions={view.repositoryMenuActions}
    onClose={onCloseRepositoryMenu}
    onNewFile={controllers.repositoryDialog.newFile}
    onNewFolder={controllers.repositoryDialog.newFolder}
    onRenameFile={controllers.repositoryDialog.renameFile}
    onRenameFolder={controllers.repositoryDialog.renameFolder}
    onDeleteFile={controllers.repositoryDialog.deleteFile}
    onDeleteFolder={controllers.repositoryDialog.deleteFolder}
  />
{/if}

{#if view.state.projectDialog !== undefined}
  <ProjectDialog
    view={{
      dialog: view.state.projectDialog,
      projects: view.state.projectRegistry.projects,
      activeProjectId: view.state.activeProjectId,
      publishedProjectId: view.state.publishedProjectId,
      publicationState: view.publicationFormState
    }}
    onIntent={controllers.projectDialog.handle}
  />
{/if}

{#if view.state.deleteDialog !== undefined}
  <RepositoryDeleteDialog
    dialog={view.state.deleteDialog}
    onCancel={controllers.repositoryDialog.closeDeleteDialog}
    onSubmit={() => void controllers.repositoryDialog.confirmDeleteDialog()}
  />
{/if}

{#if view.state.fileDialog !== undefined}
  <RepositoryFileDialog
    dialog={view.state.fileDialog}
    directories={view.repositoryDirectoryOptions}
    onCancel={controllers.repositoryDialog.closeFileDialog}
    onSubmit={() => void controllers.repositoryDialog.confirmFileDialog()}
    onDirectoryChange={controllers.repositoryDialog.updateDirectory}
    onFileNameChange={controllers.repositoryDialog.updateFileName}
  />
{/if}

<style>
  .workspace {
    display: grid;
    width: 100vw;
    height: 100vh;
    background: #252525;
  }

  .main {
    position: relative;
    display: grid;
    grid-template-rows: 36px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .auth-menu-host {
    position: absolute;
    top: 4px;
    right: 8px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .playground-auth {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .playground-auth a {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #dddddd;
    font-size: 12px;
    text-decoration: none;
  }

  .playground-auth a:hover,
  .playground-auth a:focus-visible {
    background: #343434;
    color: #ffffff;
    outline: none;
  }

  .playground-auth .sign-up,
  .playground-auth .go-to-editor {
    border-color: #bdbdbd;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 240px 1fr;
    }
  }
</style>
