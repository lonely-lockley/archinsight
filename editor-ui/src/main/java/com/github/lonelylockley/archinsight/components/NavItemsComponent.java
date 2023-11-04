package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Label;

public class NavItemsComponent extends Div {

    public NavItemsComponent() {
        setId("nav-panel");
        setWidth("100%");
        setHeight("100%");
        var repositorySelector = new RepositorySelector();
        var treeView = new RepositoryViewComponent();
        add(repositorySelector);
        add(new Label("Structure"));
        add(treeView);
    }
}
