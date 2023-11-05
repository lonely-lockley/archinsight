package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.RepositorySelectionEvent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.vaadin.flow.component.*;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.combobox.ComboBox;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;

import java.util.function.Consumer;

public class RepositorySelector extends HorizontalLayout {

    private final RemoteSource remoteSource;

    public RepositorySelector() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        var managementDialog = initManagementDialog();
        var comboBox = initRepositorySelector();
        var manageRepositoryButton = initRepositoryManagementButton(managementDialog);
        add(comboBox);
        add(manageRepositoryButton);
    }

    private ComboBox initRepositorySelector() {
        var comboBox = new ComboBox<RepositoryInfo>("Repository");
        comboBox.setClearButtonVisible(true);
        comboBox.setId("repository-selector");
        comboBox.setItemLabelGenerator(RepositoryInfo::getName);
        comboBox.setWidth("100%");
        comboBox.getElement().getStyle().set("margin-left", "5px");
        comboBox.addValueChangeListener(event -> {
            Communication.getBus().post(new RepositorySelectionEvent(event.getOldValue(), event.getValue()));
        });
        var items = remoteSource.repository.listUserRepositories();
        comboBox.setItems(items);
        if (items.size() == 1) {
            var item = items.iterator().next();
            comboBox.setValue(item);
            Communication.getBus().post(new RepositorySelectionEvent(null, item));
        }
        return comboBox;
    }

    private Button initRepositoryManagementButton(Dialog managementDialog) {
        var manageRepositoryButton = new Button(VaadinIcon.EDIT.create());
//        manageRepositoryButton.setWidth("20px");
        setVerticalComponentAlignment(FlexComponent.Alignment.END, manageRepositoryButton);
//        manageRepositoryButton.getElement().getStyle().set("padding-right", "10px");
        manageRepositoryButton.getElement().getStyle().set("margin-right", "5px");
        manageRepositoryButton.getElement().getStyle().set("margin-bottom", "5px");
        manageRepositoryButton.addClickListener(event -> {
            managementDialog.open();
        });
        manageRepositoryButton.addThemeVariants(ButtonVariant.LUMO_SMALL);
        return manageRepositoryButton;
    }

    private Dialog initManagementDialog() {
        var repositoryManagement = new Dialog();
        repositoryManagement.setModal(true);
        repositoryManagement.setHeight("50%");
        repositoryManagement.setWidth("50%");
        repositoryManagement.setDraggable(false);
        return repositoryManagement;
    }
}
