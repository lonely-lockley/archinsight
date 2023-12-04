package com.github.lonelylockley.archinsight.components.dialogs;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.RepositorySelectorComponent;
import com.github.lonelylockley.archinsight.events.CloseReason;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.RepositoryCloseEvent;
import com.github.lonelylockley.archinsight.events.RepositorySelectionEvent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.grid.Grid;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.server.VaadinService;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;

public class RepositoryManagementDialog extends Dialog {

    private final TextField input = new TextField();
    private final Button createButton = new Button("Create");
    private final Button editButton = new Button("Rename");
    private final Button deleteButton = new Button("Delete");
    private final Grid<RepositoryInfo> table = new Grid<>();
    private final RemoteSource remoteSource;

    public RepositoryManagementDialog(RepositoryInfo selected) {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setModal(true);
        setMinHeight("50%");
        setWidth("50%");
        setHeaderTitle("Manage repositories");
        setModal(true);
        setDraggable(false);
        initTable();
        var selectButton = new Button("Select", e -> {
            var selection = table.getSelectedItems();
            if (selection.size() > 0) {
                var repo = selection.iterator().next();
                if (!repo.equals(selected)) {
                    Communication.getBus().post(new RepositoryCloseEvent(CloseReason.CLOSED));
                    Communication.getBus().post(new RepositorySelectionEvent(selected, repo));
                }
                close();
            }
        });
        selectButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        selectButton.addClickShortcut(Key.ENTER);
        var cancelButton = new Button("Cancel", e -> close());
        add(initControls(selected));
        add(table);
        getFooter().add(cancelButton);
        getFooter().add(selectButton);
    }

    private HorizontalLayout initControls(RepositoryInfo selected) {
        final var controls = new HorizontalLayout();
        input.setWidth("100%");
        createButton.setMinWidth("80px");
        createButton.addClickListener(e -> {
            var repo = remoteSource.repository.createRepository(input.getValue());
            table.getListDataView().addItem(repo);
            table.select(repo);
        });
        editButton.setMinWidth("80px");
        editButton.setEnabled(false);
        editButton.addClickListener(e -> {
            var items = table.getSelectedItems();
            if (items.size() > 0) {
                var newName = input.getValue();
                var repo = items.iterator().next();
                remoteSource.repository.renameRepository(repo.getId(), newName);
                repo.setName(newName);
                if (repo.equals(selected)) {
                    Communication.getBus().post(new RepositorySelectionEvent(repo, repo));
                }
                table.getListDataView().refreshItem(repo);
            }
        });
        deleteButton.setMinWidth("80px");
        deleteButton.setEnabled(false);
        deleteButton.addClickListener(e -> {
            var items = table.getSelectedItems();
            if (items.size() > 0) {
                items.forEach(repo -> {
                    if (repo.equals(selected)) {
                        Communication.getBus().post(new RepositoryCloseEvent(CloseReason.DELETED));
                    }
                    remoteSource.repository.removeRepository(repo.getId());
                    table.deselect(repo);
                    table.getListDataView().removeItem(repo);
                });
            }
        });
        controls.add(input);
        controls.add(createButton);
        controls.add(editButton);
        controls.add(deleteButton);
        return controls;
    }

    private void initTable() {
        table.setSelectionMode(Grid.SelectionMode.SINGLE);
        final var locale = VaadinService.getCurrentRequest().getLocale();
        final var formatter = DateTimeFormatter
                .ofLocalizedDateTime(FormatStyle.MEDIUM)
                .withLocale(locale)
                .withZone(ZoneOffset.UTC);
        table.addColumn(RepositoryInfo::getName).setHeader("Name").setAutoWidth(true);
        table.addColumn(repo -> "rwx").setHeader("Permissions").setAutoWidth(true);
        table.addColumn(repo -> formatter.format(repo.getCreated())).setHeader("Created").setAutoWidth(true);
        table.addColumn(repo -> formatter.format(repo.getUpdated())).setHeader("Updated").setAutoWidth(true);
        // @todo make "share repository" button
        table.addColumn(repo -> "Not implemented").setHeader("Public Link").setAutoWidth(true);
        remoteSource.repository.listUserRepositories().forEach(repo -> table.getListDataView().addItem(repo));
        table.addSelectionListener(e -> {
            var selectiono = e.getFirstSelectedItem();
            if (selectiono.isPresent()) {
                createButton.setEnabled(false);
                editButton.setEnabled(true);
                deleteButton.setEnabled(true);
                input.setValue(selectiono.get().getName());
            }
            else {
                createButton.setEnabled(true);
                editButton.setEnabled(false);
                deleteButton.setEnabled(false);
                input.setValue("");
            }
        });
    }
}
