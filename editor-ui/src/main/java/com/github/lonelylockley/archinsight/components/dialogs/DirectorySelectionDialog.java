package com.github.lonelylockley.archinsight.components.dialogs;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.NotificationComponent;
import com.github.lonelylockley.archinsight.events.FileCreatedEvent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.grid.AbstractGridSingleSelectionModel;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.component.treegrid.TreeGrid;
import com.vaadin.flow.data.provider.hierarchy.TreeData;

import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;

@CssImport("./styles/shared-styles.css")
public class DirectorySelectionDialog extends Dialog implements FileDialog {

    private final TextField input = new TextField();

    public DirectorySelectionDialog(String title, String question1, String question2, String helpText, UUID repositoryId, Consumer<FileCreatedEvent> successAction) {
        final var remoteSource = MicronautContext.getInstance().getRemoteSource();
        setHeaderTitle(title);
        setModal(true);
        setWidth("600px");
        setHeight("600px");
        setDraggable(false);
        var grid = initView(remoteSource, repositoryId);
        add(new Label(question1));
        input.setWidth("100%");
        input.setPattern(FileSystem.POSIX_FILE_NAME_PTR);
        input.getStyle().set("padding-bottom", "10px");
        if (helpText != null) {
            input.setHelperText(helpText);
        }
        add(input);
        add(new Label(question2));
        add(grid);
        var okButton = new Button("Ok", e -> {
            var res = grid.getSelectedItems().stream().findFirst();
            var name = input.getValue();
            if (res.isPresent()) {
                var node = new RepositoryNode();
                node.setParentId(res.get().getId());
                node.setName(ensureFileExtensionAdded(name));
                node.setType(RepositoryNode.TYPE_FILE);
                node = remoteSource.repository.createNode(repositoryId, node);
                successAction.accept(new FileCreatedEvent(res.get(), node));
                close();
            }
            else {
                new NotificationComponent("Choose parent directory", MessageLevel.ERROR, 3000);
            }
        });
        okButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        okButton.addClickShortcut(Key.ENTER);
        var cancelButton = new Button("Cancel", e -> close());
        //add(questionDisplay);
        getFooter().add(cancelButton);
        getFooter().add(okButton);
    }

    private TreeGrid<RepositoryNode> initView(RemoteSource remoteSource, UUID repositoryId) {
        final var grid = new TreeGrid<RepositoryNode>();
        grid.setTreeData(new TreeData<>() {
            @Override
            public List<RepositoryNode> getChildren(RepositoryNode item) {
                var result = super.getChildren(item).stream().filter(node -> Objects.equals(RepositoryNode.TYPE_DIRECTORY, node.getType())).toList();
                if (result.size() > 1) {
                    result = result.stream().sorted(new FileSystem.NodeSorter()).toList();
                }
                return result;
            }
        });
        setClassName("prevent-select");
        ((AbstractGridSingleSelectionModel<RepositoryNode>) grid.getSelectionModel()).setDeselectAllowed(false);
        grid.addComponentHierarchyColumn(node -> {
            var icon = RepositoryNode.TYPE_DIRECTORY.equalsIgnoreCase(node.getType()) ? VaadinIcon.FOLDER.create() : VaadinIcon.FILE.create();
            var text = new Span(node.getName());
            var row = new HorizontalLayout(icon, text);
            row.setAlignItems(FlexComponent.Alignment.CENTER);
            row.setSpacing(true);
            return row;
        });
        var fs = new FileSystem(remoteSource.repository.listNodes(repositoryId));
        fs.<RepositoryNode>walkRepositoryStructureWithState((node, rootItem) -> {
            grid.getTreeData().addItem(rootItem, node);
            return node;
        }, null);
        grid.getDataProvider().refreshAll();
        grid.expandRecursively(Collections.singletonList(null), 100);
        return grid;
    }
}
