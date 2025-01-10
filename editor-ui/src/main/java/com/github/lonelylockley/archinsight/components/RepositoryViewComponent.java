package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.dialogs.ConfirmDialog;
import com.github.lonelylockley.archinsight.components.dialogs.ResultReturningDialog;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.grid.AbstractGridSingleSelectionModel;
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
        getStyle().set("background-color", "var(--lumo-contrast-5pct)");
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
        });

        switchListener.setRepositorySelectionCallback(e -> {
            var activeRepositoryStructure = remoteSource.repository.listNodes(e.getNewValue().getId());
            var tr = remoteSource.translator.translate(null, e.getNewValue().getId(), ArchLevel.CONTEXT, false, Collections.EMPTY_LIST);
            Communication.getBus().post(new DeclarationsParsedEvent(tr.getDeclarations()));
            var fs = new FileSystem(activeRepositoryStructure);
            fileSystem = fs;
            getTreeData().clear();
            fs.<RepositoryNode>walkRepositoryStructureWithState((node, rootItem) -> {
                getTreeData().addItem(rootItem, node);
                return node;
            }, null);
            getDataProvider().refreshAll();
            expandRecursively(Collections.singletonList(null), 1);
        });

        final var fileRestorationListener = new BaseListener<FileRestoreEvent>() {
            @Override
            @Subscribe
            public void receive(FileRestoreEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    fileRestorationCallback(e.getRestoredFileId(), e.getSource());
                }
            }
        };
        Communication.getBus().register(fileRestorationListener);

        final var sourceCompilationListener = new BaseListener<SourceCompilationEvent>() {
            @Override
            @Subscribe
            public void receive(SourceCompilationEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                if (e.success()) {
                    filesWithErrors.clear();
                }
                else
                if (e.failure() && !e.getFilesWithErrors().isEmpty()) {
                    filesWithErrors = e.getFilesWithErrors();
                }
                getDataProvider().refreshAll();
            }
            }
        };
        Communication.getBus().register(sourceCompilationListener);

        final var fileCreatedListener = new BaseListener<FileCreatedEvent>() {
            @Override
            @Subscribe
            public void receive(FileCreatedEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                getTreeData().addItem(e.getParent(), e.getCreatedFile());
                fileSystem.createNode(e.getCreatedFile());
                getDataProvider().refreshAll();
            }
            }
        };
        Communication.getBus().register(fileCreatedListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(fileRestorationListener);
            Communication.getBus().unregister(sourceCompilationListener);
            Communication.getBus().unregister(fileCreatedListener);
        });

        addItemClickListener(e -> {
            if (e.getClickCount() == 2) {
                openNode(Set.of(e.getItem()));
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
                if (!switchListener.repositoryOpened() || getSelectedItems().isEmpty()) {
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
                Communication.getBus().post(new FileOpenRequestEvent(node));
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
        node = createNode(node);
        Communication.getBus().post(new FileOpenRequestEvent(node));
    }

    private void createDirectory(String name) {
        var node = new RepositoryNode();
        node.setName(name);
        node.setType(RepositoryNode.TYPE_DIRECTORY);
        createNode(node);
    }

    private RepositoryNode createNode(RepositoryNode node) {
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
        node = fileSystem.createNode(node);
        getDataProvider().refreshAll();
        return node;
    }

    private void removeNode() {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            var deletedObjects = remoteSource.repository.removeNode(switchListener.getActiveRepositoryId(), node.getId());
            getTreeData().removeItem(node);
            fileSystem.removeNode(node.getId());
            getDataProvider().refreshAll();
            deselect(node);
            Communication.getBus().post(new FileCloseRequestEvent(deletedObjects, FileChangeReason.DELETED));
        }
    }

    private void renameNode(String newName) {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            newName = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? newName : ensureFileExtensionAdded(newName);
            remoteSource.repository.renameNode(switchListener.getActiveRepositoryId(), node.getId(), newName);
            fileSystem.renameNode(node.getId(), newName);
            getDataProvider().refreshItem(node);
            getDataProvider().refreshAll();
            Communication.getBus().post(new FileChangeEvent(node));
        }
    }

    private void fileRestorationCallback(UUID fileId, Optional<String> source) {
        if (fileId != null) {
            if (fileSystem.hasNode(fileId)) {
                var node = fileSystem.getNode(fileId);
                // open all menu items and select current file
                select(node);
                Communication.getBus().post(new FileOpenRequestEvent(node, source));
                while (node.getParentId() != null) {
                    node = fileSystem.getNode(node.getParentId());
                    expand(node);
                }
            }
        }
    }

}
