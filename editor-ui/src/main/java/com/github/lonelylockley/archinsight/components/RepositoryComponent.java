package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public class RepositoryComponent extends VerticalLayout {

    public RepositoryComponent(boolean readOnly) {
        setId("repository-panel");
        setWidth("100%");
        setHeight("100%");
        getElement().setAttribute("theme", "spacing");
        var treeView = new RepositoryViewComponent(readOnly); // this MUST be created prior to RepositorySelectorComponent, so it would be able to listen to events
        var repositorySelector = new RepositorySelectorComponent(readOnly);
        add(repositorySelector);
        var label = new Label("Structure");
        label.getStyle().set("color", "var(--lumo-secondary-text-color)");
        label.getStyle().set("font-size", "var(--lumo-font-size-s)");
        label.getStyle().set("font-weight", "500");
        label.getStyle().set("margin-bottom", "-5px");
        label.getStyle().set("padding-left", "5px");
        add(label);
        add(treeView);
    }
}
