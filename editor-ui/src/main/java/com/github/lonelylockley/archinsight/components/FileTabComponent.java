package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.*;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.tabs.Tab;
import com.vaadin.flow.component.tabs.TabSheet;
import com.vaadin.flow.dom.Element;

public class FileTabComponent extends TabSheet {
    private final SwitchListenerHelper switchListener;

    public FileTabComponent(MenuBarComponent menu, SwitchListenerHelper switchListener) {
        this.switchListener = switchListener;
        final var menuBar = new HorizontalLayout();
        menuBar.add(menu);
        if (Authentication.playgroundModeEnabled() && !Authentication.authenticated()) {
            menuBar.add(new CreateRepositoryComponent());
        }
        var menuTab = new Tab(menuBar);
        menuTab.getStyle().set("padding-left", "2px");
        setSizeFull();
    }

    public void openFile(RepositoryNode file) {
        final var editor = new EditorComponent(switchListener);
        final var view = new SVGViewComponent();
        final var splitPane = new SplitViewComponent(editor, view);
        final var editorTab = new Tab(file.getName());
        final var closeButton = new Button(VaadinIcon.CLOSE_SMALL.create());
        closeButton.addThemeVariants(ButtonVariant.LUMO_SMALL);
        closeButton.getStyle().set("padding", "0px");
        closeButton.getStyle().set("margin-left", "5px");
        closeButton.addThemeVariants(ButtonVariant.LUMO_TERTIARY, ButtonVariant.LUMO_ICON);
        closeButton.addClickListener(e -> {
            remove(editorTab);
        });
        editorTab.add(closeButton);
        add(editorTab, splitPane);
        setSelectedTab(editorTab);
    }


}
