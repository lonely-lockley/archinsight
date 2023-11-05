package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Label;

public class NavItemsComponent extends Div {

    public NavItemsComponent() {
        setId("nav-panel");
        setWidth("100%");
        setHeight("100%");
        var treeView = new RepositoryViewComponent(); // this MUST be created prior to RepositorySelector so it would be able to listen to events
        var repositorySelector = new RepositorySelector();
        add(repositorySelector);
        add(new Label("Structure"));
        add(treeView);
    }
}
