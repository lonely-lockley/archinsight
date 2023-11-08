package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.repository.RepostioryInfo;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.*;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.grid.AbstractGridSingleSelectionModel;
import com.vaadin.flow.component.grid.ItemClickEvent;
import com.vaadin.flow.component.grid.contextmenu.GridContextMenu;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.component.treegrid.TreeGrid;

import java.util.*;
import java.util.function.Consumer;

public class RepositoryViewComponent extends TreeGrid<RepositoryNode> {

    private final RemoteSource remoteSource;

    private RepostioryInfo activeRepository;
    private FileSystem fileSystem;

    public RepositoryViewComponent(boolean readOnly) {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();

        setWidth("100%");
        setHeight("100%");
        ((AbstractGridSingleSelectionModel<RepositoryNode>) getSelectionModel()).setDeselectAllowed(false);
        var contextMenu = initContextMenu(readOnly);
        var column = this.addComponentHierarchyColumn(node -> {
                        var icon = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? VaadinIcon.FOLDER.create() : VaadinIcon.FILE.create();
                        var row = new HorizontalLayout(icon, new Label(node.getName()));
                        row.setAlignItems(FlexComponent.Alignment.CENTER);
                        row.setSpacing(true);
                        row.setId("gridview_" + node.getId().toString());
                        return row;
                    });

        final var repositoryCloseListener = new BaseListener<RepositoryCloseEvent>() {
            @Override
            @Subscribe
            public void receive(RepositoryCloseEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    activeRepository = null;
                    fileSystem = null;
                    getTreeData().clear();
                    getDataProvider().refreshAll();
                    deselectAll();
                    storeOpenedFile(null);
                }
            }
        };
        Communication.getBus().register(repositoryCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositoryCloseListener); });

        final var repositorySelectionListener = new BaseListener<RepositorySelectionEvent>() {
            @Override
            @Subscribe
            public void receive(RepositorySelectionEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    activeRepository = e.getNewValue();
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
                }
            }
        };
        Communication.getBus().register(repositorySelectionListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositorySelectionListener); });

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
        var lb = new Label("Open");
        lb.setId("repository-tree-view-open-file");
        final var openFile = menu.addItem(lb, event -> openNode(getSelectedItems()));
        // =============================================================================================================
        lb = new Label("New file");
        lb.setId("repository-tree-view-new-file");
        final var newFile = menu.addItem(lb, event ->
                new ResultReturningDialog("Create new file", "File name", "Archinsight will add an .ai extension automatically", this::createFile).open());
        // =============================================================================================================
        lb = new Label("New directory");
        lb.setId("repository-tree-view-new-dir");
        final var newDirectory = menu.addItem(lb, event ->
                new ResultReturningDialog("Create new directory", "Directory name", null, this::createDirectory).open());
        // =============================================================================================================
        lb = new Label("Rename");
        lb.setId("repository-tree-view-rename-file");
        final var editFile = menu.addItem(lb, event ->
                new ResultReturningDialog("Rename %s", "New %s name", null, this::renameNode).show(getSelectedItems()));
        // =============================================================================================================
        lb = new Label("Delete");
        lb.setId("repository-tree-view-delete-file");
        final var deleteFile = menu.addItem(lb, event ->
                new ConfirmDialog("Confirm delete", "Are you sure want to delete %s `%s`?", this::removeNode).show(getSelectedItems()));
        // =============================================================================================================
        menu.addGridContextMenuOpenedListener(event -> {
            if (activeRepository != null && !readOnly) {
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
                if (activeRepository == null || getSelectedItems().isEmpty()) {
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
                Communication.getBus().post(new FileCloseRequestEvent());
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
        RepositoryNode parent = null;
        if (selection.isEmpty()) {
            parent = fileSystem.getRoot();
            node.setParentId(parent.getId());
        }
        else {
            parent = fileSystem.getClosestDirectory(selection.iterator().next());
            node.setParentId(parent.getId());
        }
        node = remoteSource.repository.createNode(activeRepository.getId(), node);
        getTreeData().addItem(parent, node);
        getDataProvider().refreshAll();
    }

    private void removeNode() {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            remoteSource.repository.removeNode(activeRepository.getId(), node.getId());
            getTreeData().removeItem(node);
            getDataProvider().refreshAll();
            deselect(node);
            Communication.getBus().post(new FileCloseRequestEvent());
            storeOpenedFile(null);
        }
    }

    private void renameNode(String newName) {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            newName = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? newName : ensureFileExtensionAdded(newName);
            remoteSource.repository.renameNode(activeRepository.getId(), node.getId(), newName);
            node.setName(newName);
            getDataProvider().refreshItem(node);
            getDataProvider().refreshAll();
        }
    }

    private void storeOpenedFile(UUID fileId) {
        if (!Authentication.playgroundModeEnabled()) {
            getElement().executeJs("localStorage.setItem($0, $1)", "org.archinsight.editor.file", fileId == null ? "" : fileId.toString());
        }
    }

    private void restoreOpenedFile() {
        if (!Authentication.playgroundModeEnabled()) {
            getElement().executeJs("return (localStorage.getItem($0) || '')", "org.archinsight.editor.file").then(String.class, fileId -> {
                var id = fileId.isBlank() ? null : UUID.fromString(fileId);
                if (id != null) {
                    if (fileSystem.hasNode(id)) {
                        var node = fileSystem.getNode(id);
                        // open all menu items and select current file
                        select(node);
                        Communication.getBus().post(new FileRestoredEvent(node));
                        while (node.getParentId() != null) {
                            node = fileSystem.getNode(node.getParentId());
                            expand(node);
                        }
                    }
                }
            });
        }
    }

    private static class ResultReturningDialog extends Dialog {

        private final TextField textField = new TextField();
        private final String title;
        private final String textFieldName;

        public ResultReturningDialog(String title, String textFieldName, String helpText, Consumer<String> successAction) {
            this.title = title;
            this.textFieldName = textFieldName;
            setModal(true);
            setWidth("600px");
            setDraggable(false);
            textField.setWidth("100%");
            textField.setPattern(FileSystem.POSIX_FILE_NAME_PTR);
            if (helpText != null) {
                textField.setHelperText("");
            }
            var saveButton = new Button("Save", e -> {
                successAction.accept(textField.getValue());
                close();
            });
            saveButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
            saveButton.addClickShortcut(Key.ENTER);
            var cancelButton = new Button("Cancel", e -> close());
            add(textField);
            getFooter().add(cancelButton);
            getFooter().add(saveButton);
        }

        public void show(Set<RepositoryNode> selection) {
            if (!selection.isEmpty()) {
                var node = selection.iterator().next();
                var objectTypeText = RepositoryNode.TYPE_FILE.equalsIgnoreCase(node.getType()) ? "file" : "directory";
                setHeaderTitle(String.format(title, objectTypeText));
                textField.setValue(node.getName());
                textField.setLabel(String.format(textFieldName, objectTypeText));
                textField.focus();
                super.open();
            }
        }

        @Override
        public void open() {
            setHeaderTitle(title);
            textField.setLabel(textFieldName);
            textField.setValue("");
            textField.focus();
            super.open();
        }
    }

    private static class ConfirmDialog extends Dialog {

        private final String confirmationQuestionPattern;
        private final Label questionDisplay = new Label();;

        public ConfirmDialog(String title, String confirmationQuestionPattern, Runnable successAction) {
            this.confirmationQuestionPattern = confirmationQuestionPattern;
            setHeaderTitle(title);
            setModal(true);
            setWidth("600px");
            setDraggable(false);
            var okButton = new Button("Ok", e -> {
                successAction.run();
                close();
            });
            okButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
            okButton.addClickShortcut(Key.ENTER);
            var cancelButton = new Button("Cancel", e -> close());
            add(questionDisplay);
            getFooter().add(cancelButton);
            getFooter().add(okButton);
        }

        public void show(Set<RepositoryNode> selection) {
            if (!selection.isEmpty()) {
                var node = selection.iterator().next();
                var objectTypeText = RepositoryNode.TYPE_FILE.equalsIgnoreCase(node.getType()) ? "file" : "directory";
                questionDisplay.setText(String.format(confirmationQuestionPattern, objectTypeText, node.getName()));
                super.open();
            }
        }

    }

}
