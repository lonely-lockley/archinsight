package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.repository.FileSystem;
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

import java.util.Collections;
import java.util.Set;
import java.util.function.Consumer;

public class RepositoryViewComponent extends TreeGrid<RepositoryNode> {

    private final RemoteSource remoteSource;

    private RepositoryInfo activeRepository;
    private FileSystem fileSystem;

    public RepositoryViewComponent() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();

        setWidth("100%");
        setHeight("100%");
        ((AbstractGridSingleSelectionModel<RepositoryNode>) getSelectionModel()).setDeselectAllowed(false);
        var contextMenu = initContextMenu();
        var column = this.addComponentHierarchyColumn(node -> {
                        var icon = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? VaadinIcon.FOLDER.create() : VaadinIcon.FILE.create();
                        var row = new HorizontalLayout(icon, new Label(node.getName()));
                        row.setAlignItems(FlexComponent.Alignment.CENTER);
                        row.setSpacing(true);
                        row.setId("gridview_" + node.getId().toString());
                        return row;
                    });
        final var repositorySelectionListener = new BaseListener<RepositorySelectionEvent>() {
            @Override
            @Subscribe
            public void receive(RepositorySelectionEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (e.getNewValue() != null) {
                        RepositoryViewComponent.this.activeRepository = e.getNewValue();
                        var activeRepositoryStructure = remoteSource.repository.listNodes(e.getNewValue().getId());
                        var fs = new FileSystem(activeRepositoryStructure);
                        RepositoryViewComponent.this.fileSystem = fs;
                        RepositoryViewComponent.this.getTreeData().clear();
                        fs.<RepositoryNode>walkRepositoryStructureWithState((node, rootItem) -> {
                            RepositoryViewComponent.this.getTreeData().addItem(rootItem, node);
                            return node;
                        }, null);
                        RepositoryViewComponent.this.getDataProvider().refreshAll();
                        RepositoryViewComponent.this.expandRecursively(Collections.singletonList(null), 1);
                    }
                    else {
                        RepositoryViewComponent.this.activeRepository = null;
                        RepositoryViewComponent.this.fileSystem = null;
                        RepositoryViewComponent.this.getTreeData().clear();
                        RepositoryViewComponent.this.getDataProvider().refreshAll();
                    }
                }
            }
        };
        Communication.getBus().register(repositorySelectionListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositorySelectionListener); });

        addItemClickListener(new ComponentEventListener<ItemClickEvent<RepositoryNode>>() {

            private RepositoryNode selection = null;

            @Override
            public void onComponentEvent(ItemClickEvent<RepositoryNode> event) {
                if (event.getClickCount() > 1) {
                    if (selection == null || !selection.getId().equals(event.getItem().getId())) {
                        selection = event.getItem();
                        if (RepositoryNode.TYPE_FILE.equals(selection.getType())) {
                            Communication.getBus().post(new FileOpenRequestEvent(selection));
                        }
                        else {
                            RepositoryViewComponent.this.expand(selection);
                        }
                    }
                }
            }
        });
    }

    private GridContextMenu<RepositoryNode> initContextMenu() {
        var menu = addContextMenu();
        // =============================================================================================================
        var lb = new Label("New file");
        lb.setId("repository-tree-view-new-file");
        final var newFileDialog = new ResultReturningDialog("Create new file", "File name", "Archinsight will add an .ai extension automatically", this::createFile);
        final var newFile = menu.addItem(lb, event -> newFileDialog.open());
        // =============================================================================================================
        lb = new Label("New directory");
        lb.setId("repository-tree-view-new-dir");
        var editDirectoryDialog = new ResultReturningDialog("Create new directory", "Directory name", null, this::createDirectory);
        final var newDirectory = menu.addItem(lb, event -> editDirectoryDialog.open());
        // =============================================================================================================
        lb = new Label("Rename");
        lb.setId("repository-tree-view-rename-file");
        var editFileDialog = new ResultReturningDialog("Rename %s", "New %s name", null, this::renameNode);
        final var editFile = menu.addItem(lb, event -> editFileDialog.show(getSelectedItems()));
        // =============================================================================================================
        lb = new Label("Delete");
        lb.setId("repository-tree-view-delete-file");
        var deleteFileDialog = new ConfirmDialog("Confirm delete", "Are you sure want to delete %s `%s`?", this::removeNode);
        final var deleteFile = menu.addItem(lb, event -> deleteFileDialog.show(getSelectedItems()));
        // =============================================================================================================
        menu.addGridContextMenuOpenedListener(event -> {
            if (activeRepository != null) {
                newFile.setEnabled(true);
                newDirectory.setEnabled(true);
                var selected = RepositoryViewComponent.this.getSelectedItems();
                if (selected.isEmpty()) {
                    editFile.setEnabled(false);
                    deleteFile.setEnabled(false);
                }
                else {
                    editFile.setEnabled(true);
                    deleteFile.setEnabled(true);
                }
            }
            else {
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
        RepositoryViewComponent.this.getTreeData().addItem(parent, node);
        RepositoryViewComponent.this.getDataProvider().refreshAll();
    }

    private void removeNode() {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            remoteSource.repository.removeNode(activeRepository.getId(), node.getId());
            RepositoryViewComponent.this.getTreeData().removeItem(node);
            RepositoryViewComponent.this.getDataProvider().refreshAll();
        }
    }

    private void renameNode(String newName) {
        var selection = getSelectedItems();
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            newName = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? newName : ensureFileExtensionAdded(newName);
            node = remoteSource.repository.renameNode(activeRepository.getId(), node.getId(), newName);
            node.setName(newName);
            RepositoryViewComponent.this.getDataProvider().refreshItem(node);
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