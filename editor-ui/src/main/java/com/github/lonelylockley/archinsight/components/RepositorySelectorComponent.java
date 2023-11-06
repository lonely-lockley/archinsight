package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.BaseListener;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.RepositorySelectionEvent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.grid.Grid;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.server.VaadinService;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;

public class RepositorySelectorComponent extends VerticalLayout {

    private final RemoteSource remoteSource;

    private RepositoryInfo selected = null;

    public RepositorySelectorComponent() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setWidth("100%");
        add(initLabel());
        add(initRepositorySelector());
    }

    private Label initLabel() {
        var label = new Label("Repository");
        label.getStyle().set("color", "var(--lumo-secondary-text-color)");
        label.getStyle().set("font-size", "var(--lumo-font-size-s)");
        label.getStyle().set("font-weight", "500");
        return label;
    }

    private Button initRepositorySelector() {
        final var manageRepositoryButton = new Button("<Choose Repository>");
        manageRepositoryButton.setWidth("100%");
        manageRepositoryButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        var items = remoteSource.repository.listUserRepositories();
        if (items.size() == 1) {
            var item = items.iterator().next();
            manageRepositoryButton.setText(String.format("[ %s ]", item.getName()));
            // this event is sent before a listener is added, so it won't cause cycle
            Communication.getBus().post(new RepositorySelectionEvent(null, item));
        }
        manageRepositoryButton.addClickListener(event -> {
            var dlg = new ManagementDialog();
            dlg.open();
        });
        final var repositorySelectionListener = new BaseListener<RepositorySelectionEvent>() {
            @Override
            @Subscribe
            public void receive(RepositorySelectionEvent e) {
                manageRepositoryButton.setText(String.format("[ %s ]", e.getNewValue().getName()));
                RepositorySelectorComponent.this.selected = e.getNewValue();
            }
        };
        Communication.getBus().register(repositorySelectionListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositorySelectionListener); });
        return manageRepositoryButton;
    }

    private class ManagementDialog extends Dialog {

        private final TextField input = new TextField();
        private final Button createButton = new Button("Create");
        private final Button editButton = new Button("Edit");
        private final Button deleteButton = new Button("Delete");
        private final Grid<RepositoryInfo> table = new Grid<>();

        public ManagementDialog() {
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
                    Communication.getBus().post(new RepositorySelectionEvent(RepositorySelectorComponent.this.selected, selection.iterator().next()));
                    close();
                }
            });
            selectButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
            selectButton.addClickShortcut(Key.ENTER);
            var cancelButton = new Button("Cancel", e -> close());
            add(initControls());
            add(table);
            getFooter().add(cancelButton);
            getFooter().add(selectButton);
        }

        private HorizontalLayout initControls() {
            final var controls = new HorizontalLayout();
            input.setWidth("100%");
            createButton.setMinWidth("80px");
            createButton.addClickListener(e -> {
                var repo = remoteSource.repository.createRepository(input.getValue());
                table.getListDataView().addItem(repo);
            });
            editButton.setMinWidth("65px");
            editButton.setEnabled(false);
            deleteButton.setMinWidth("80px");
            deleteButton.setEnabled(false);
            deleteButton.addClickListener(e -> {
                table.getSelectedItems().forEach(repo -> {
                    remoteSource.repository.removeRepository(repo.getId());
                    table.getListDataView().removeItem(repo);
                });
            });
            controls.add(input);
            controls.add(createButton);
            controls.add(editButton);
            controls.add(deleteButton);
            return controls;
        }

        private void initTable() {
            table.setSelectionMode(Grid.SelectionMode.SINGLE);
//            tbl.setWidth("100%");
//            tbl.setHeight("100%");
//            UI.getCurrent().getPage().retrieveExtendedClientDetails(extendedClientDetails -> {
//                extendedClientDetails.getTimeZoneId()
//            });
            final var locale = VaadinService.getCurrentRequest().getLocale();
            final var formatter = DateTimeFormatter
                    .ofLocalizedDateTime(FormatStyle.MEDIUM)
                    .withLocale(locale)
                    .withZone(ZoneOffset.UTC);
            table.addColumn(RepositoryInfo::getName).setHeader("Name").setAutoWidth(true);
            table.addColumn(RepositoryInfo::getPermissions).setHeader("Permissions").setAutoWidth(true);
            table.addColumn(repo -> formatter.format(repo.getCreated())).setHeader("Created").setAutoWidth(true);
            table.addColumn(repo -> formatter.format(repo.getUpdated())).setHeader("Updated").setAutoWidth(true);
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
}
