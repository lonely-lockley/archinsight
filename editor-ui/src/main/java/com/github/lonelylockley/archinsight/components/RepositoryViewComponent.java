package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.dialogs.ConfirmDialog;
import com.github.lonelylockley.archinsight.components.dialogs.ResultReturningDialog;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.*;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.grid.AbstractGridSingleSelectionModel;
import com.vaadin.flow.component.grid.ItemClickEvent;
import com.vaadin.flow.component.grid.contextmenu.GridContextMenu;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.treegrid.TreeGrid;
import com.vaadin.flow.data.provider.hierarchy.TreeData;

import java.util.*;

@CssImport("./styles/shared-styles.css")
public class RepositoryViewComponent extends TreeGrid<RepositoryNode> {

    private final RemoteSource remoteSource;
    private final SwitchListenerHelper switchListener;

    private Set<UUID> filesWithErrors = new HashSet<>();
    private FileSystem fileSystem;

    public RepositoryViewComponent(boolean readOnly) {
        this.switchListener = new SwitchListenerHelper(this);
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setTreeData(new TreeData<>() {
            @Override
            public List<RepositoryNode> getChildren(RepositoryNode item) {
                var result = super.getChildren(item);
                if (result.size() > 1) {
                    result = result.stream().sorted(new FileSystem.NodeSorter()).toList();
                }
                return result;
            }
        });
        setClassName("prevent-select");
        ((AbstractGridSingleSelectionModel<RepositoryNode>) getSelectionModel()).setDeselectAllowed(false);
        initContextMenu(readOnly);
        addComponentHierarchyColumn(node -> {
            var icon = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? VaadinIcon.FOLDER.create() : VaadinIcon.FILE.create();
            var text = new Span(node.getName());
            var row = new HorizontalLayout(icon, text);
            row.setAlignItems(FlexComponent.Alignment.CENTER);
            row.setSpacing(true);
            row.setId("gridnode_" + node.getId().toString());
            if (filesWithErrors.contains(node.getId())) {
                text.setClassName("contains-errors");
            }
            return row;
        }).setAutoWidth(true);
        addExpandListener((event) -> {
            recalculateColumnWidths();
        });

        switchListener.setRepositoryCloseCallback(e -> {
            fileSystem = null;
            getTreeData().clear();
            getDataProvider().refreshAll();
            deselectAll();
            storeOpenedFile(null);
        });

        switchListener.setRepositorySelectionCallback(e -> {
            var activeRepositoryStructure = remoteSource.repository.listNodes(e.getNewValue().getId());
            var fs = new FileSystem(activeRepositoryStructure);
            fileSystem = fs;
            getTreeData().clear();
            fs.<RepositoryNode>walkRepositoryStructureWithState((node, rootItem) -> {
                getTreeData().addItem(rootItem, node);
                return node;
            }, null);
            getDataProvider().refreshAll();
            expandRecursively(Collections.singletonList(null), 1);
            restoreOpenedFile();
        });

        final var sourceCompilationListener = new BaseListener<SourceCompilationEvent>() {
            @Override
            @Subscribe
            public void receive(SourceCompilationEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (e.failure() && !e.getMessagesByFile().isEmpty()) {
                        filesWithErrors = e.getMessagesByFile().keySet();
                    }
                    if (e.success()) {
                        filesWithErrors.clear();
                    }
                    getDataProvider().refreshAll();
                }
            }
        };
        Communication.getBus().register(sourceCompilationListener);
        addDetachListener(e -> { Communication.getBus().unregister(sourceCompilationListener); });

        final var fileCreatedListener = new BaseListener<FileCreatedEvent>() {
            @Override
            @Subscribe
            public void receive(FileCreatedEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    getTreeData().addItem(e.getParent(), e.getCreatedFile());
                    fileSystem.createNode(e.getCreatedFile());
                    getDataProvider().refreshAll();
                    storeOpenedFile(e.getCreatedFile().getId());
                    fileRestorationCallback(e.getCreatedFile().getId());
                }
            }
        };
        Communication.getBus().register(fileCreatedListener);
        addDetachListener(e -> { Communication.getBus().unregister(fileCreatedListener); });

        addItemClickListener(new ComponentEventListener<ItemClickEvent<RepositoryNode>>() {
            @Override
            public void onComponentEvent(ItemClickEvent<RepositoryNode> event) {
                if (event.getClickCount() == 2) {
                    openNode(Set.of(event.getItem()));
                }
            }
        });
    }

    private GridContextMenu<RepositoryNode> initContextMenu(boolean readOnly) {
        var menu = addContextMenu();
        // =============================================================================================================
        var lb = new Span("Open");
        lb.setId("repository-tree-view-open-file");
        final var openFile = menu.addItem(lb, event -> openNode(getSelectedItems()));
        // =============================================================================================================
        lb = new Span("New file");
        lb.setId("repository-tree-view-new-file");
        final var newFile = menu.addItem(lb, event ->
                new ResultReturningDialog("Create new file", "File name", "Archinsight will add an .ai extension automatically", this::createFile).open());
        // =============================================================================================================
        lb = new Span("New directory");
        lb.setId("repository-tree-view-new-dir");
        final var newDirectory = menu.addItem(lb, event ->
                new ResultReturningDialog("Create new directory", "Directory name", null, this::createDirectory).open());
        // =============================================================================================================
        lb = new Span("Rename");
        lb.setId("repository-tree-view-rename-file");
        final var editFile = menu.addItem(lb, event ->
                new ResultReturningDialog("Rename %s", "New %s name", null, this::renameNode).show(getSelectedItems()));
        // =============================================================================================================
        lb = new Span("Delete");
        lb.setId("repository-tree-view-delete-file");
        final var deleteFile = menu.addItem(lb, event ->
                new ConfirmDialog("Confirm delete", "Are you sure want to delete %s `%s`?", this::removeNode).show(getSelectedItems()));
        // =============================================================================================================
        menu.addGridContextMenuOpenedListener(event -> {
            if (switchListener.repositoryOpened() && !readOnly) {
                openFile.setEnabled(false);
                newFile.setEnabled(true);
                newDirectory.setEnabled(true);
                if (getSelectedItems().isEmpty()) {
                    openFile.setEnabled(false);
                    editFile.setEnabled(false);
                    deleteFile.setEnabled(false);
                }
                else {
                    openFile.setEnabled(true);
                    editFile.setEnabled(true);
                    deleteFile.setEnabled(true);
                }
            }
            else {
                if (switchListener.repositoryOpened() || getSelectedItems().isEmpty()) {
                    openFile.setEnabled(false);
                }
                else {
                    openFile.setEnabled(true);
                }
                newFile.setEnabled(false);
                newDirectory.setEnabled(false);
                editFile.setEnabled(false);
                deleteFile.setEnabled(false);
            }
        });
        return menu;
    }

    private String ensureFileExtensionAdded(String name) {
        return name.endsWith(".ai") ? name : name + ".ai";
    }

    private void openNode(Set<RepositoryNode> selection) {
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                Communication.getBus().post(new FileCloseRequestEvent(CloseReason.CLOSED));
                Communication.getBus().post(new FileOpenRequestEvent(node));
                storeOpenedFile(node.getId());
            }
            else {
                RepositoryViewComponent.this.expand(selection);
            }
        }
    }

    private void createFile(String name) {
        var node = new RepositoryNode();
        node.setName(ensureFileExtensionAdded(name));
        node.setType(RepositoryNode.TYPE_FILE);
        createNode(node);
    }

    private void createDirectory(String name) {
        var node = new RepositoryNode();
        node.setName(name);
        node.setType(RepositoryNode.TYPE_DIRECTORY);
        createNode(node);
    }

    private void createNode(RepositoryNode node) {
        var selection = getSelectedItems();
        RepositoryNode parent;
        if (selection.isEmpty()) {
            parent = fileSystem.getRoot();
            node.setParentId(parent.getId());
        }
        else {
            parent = fileSystem.getClosestDirectory(selection.iterator().next());
            node.setParentId(parent.getId());
        }
        node = remoteSource.repository.createNode(switchListener.getActiveRepositoryId(), node);
        getTreeData().addItem(parent, node);
        fileSystem.createNode(node);
        getDataProvider().refreshAll();
    }

    private void removeNode() {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            var deleted = remoteSource.repository.removeNode(switchListener.getActiveRepositoryId(), node.getId());
            getTreeData().removeItem(node);
            fileSystem.removeNode(node.getId());
            getDataProvider().refreshAll();
            deselect(node);
            if (deleted.contains(switchListener.getOpenedFileId())) {
                Communication.getBus().post(new FileCloseRequestEvent(CloseReason.DELETED));
            }
            storeOpenedFile(null);
        }
    }

    private void renameNode(String newName) {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            newName = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? newName : ensureFileExtensionAdded(newName);
            remoteSource.repository.renameNode(switchListener.getActiveRepositoryId(), node.getId(), newName);
            node.setName(newName);
            fileSystem.renameNode(node.getId(), newName);
            getDataProvider().refreshItem(node);
            getDataProvider().refreshAll();
        }
    }

    private void storeOpenedFile(UUID fileId) {
        var key = Authentication.playgroundModeEnabled() ? "org.archinsight.playground.file" : "org.archinsight.editor.file";
        getElement().executeJs("localStorage.setItem($0, $1)", key, fileId == null ? "" : fileId.toString());
    }

    private void fileRestorationCallback(String fileId) {
        fileRestorationCallback(fileId.isBlank() ? null : UUID.fromString(fileId));
    }

    private void fileRestorationCallback(UUID fileId) {
        if (fileId != null) {
            if (fileSystem.hasNode(fileId)) {
                var node = fileSystem.getNode(fileId);
                // open all menu items and select current file
                select(node);
                Communication.getBus().post(new FileRestoredEvent(node));
                while (node.getParentId() != null) {
                    node = fileSystem.getNode(node.getParentId());
                    expand(node);
                }
            }
        }
    }

    private void restoreOpenedFile() {
        var key = Authentication.playgroundModeEnabled() ? "org.archinsight.playground.file" : "org.archinsight.editor.file";
        getElement().executeJs("return (localStorage.getItem($0) || '')", key).then(String.class, this::fileRestorationCallback);
    }

}
