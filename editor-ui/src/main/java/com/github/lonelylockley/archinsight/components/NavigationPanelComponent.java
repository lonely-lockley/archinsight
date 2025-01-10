package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.tabs.TabSheet;

public class NavigationPanelComponent extends TabSheet {

    public NavigationPanelComponent(boolean readOnly) {
        setId("navigation-panel");
        setHeight("100%");
        //getStyle().setMarginRight("-10px").setMarginLeft("-10px");
        getStyle().set("background-color", "var(--lumo-contrast-5pct)");
        // structure component must be initialised prior to
        var structure = initStructureLayout(readOnly);
        var repository = initRepositoryLayout(readOnly);
        this.add("Repository", repository);
        this.add("Structure", structure);
    }

    private VerticalLayout initRepositoryLayout(boolean readOnly) {
        var layout = new VerticalLayout();
        layout.setPadding(false);
        layout.setSpacing(false);
        layout.setWidth("299px");
        layout.getStyle().setMarginLeft("-10px").setMarginRight("-10px");
        layout.setHeightFull();
        // this MUST be created prior to RepositorySelectorComponent, so it would be able to listen for events
        var treeView = new RepositoryViewComponent(readOnly);
        var repositorySelector = new RepositorySelectorComponent();
        layout.add(repositorySelector);
        layout.add(treeView);
        return layout;
    }

    private VerticalLayout initStructureLayout(boolean readOnly) {
        var layout = new VerticalLayout();
        layout.setPadding(false);
        layout.setSpacing(false);
        layout.setWidth("299px");
        layout.getStyle().setMarginLeft("-10px").setMarginRight("-10px");
        layout.setHeightFull();
        layout.getStyle().setMarginTop("-6px");
        var treeView = new StructureViewComponent(readOnly);
        layout.add(new StructureExplorerComponent(treeView));
        return layout;
    }

}
