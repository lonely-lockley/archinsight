package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.tabs.Tab;
import com.vaadin.flow.component.tabs.TabSheet;

public class NavigationPanelComponent extends TabSheet {

    public NavigationPanelComponent(boolean readOnly) {
        setId("navigation-panel");
        setHeight("100%");
        //getStyle().setMarginRight("-10px").setMarginLeft("-10px");
        var fileTree = initRepositoryLayout(readOnly);
        var struct = initStructureLayout(readOnly, fileTree);
        addSelectedChangeListener(e -> {
            if (e.getSelectedTab() == struct._1) {
                // call row height recalculation because of some bug in TreeGrid. This causes flicker, but no solution is known for now
                struct._2.fixTreeGridRowHeightCalculationBux();
            }
        });
    }

    private RepositoryViewComponent initRepositoryLayout(boolean readOnly) {
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
        this.add("Repository", layout);
        return treeView;
    }

    private Tuple2<Tab, StructureViewComponent> initStructureLayout(boolean readOnly, RepositoryViewComponent fileTree) {
        var layout = new VerticalLayout();
        layout.setPadding(false);
        layout.setSpacing(false);
        layout.setWidth("299px");
        layout.getStyle().setMarginLeft("-10px").setMarginRight("-10px");
        layout.setHeightFull();
        layout.getStyle().setMarginTop("-6px");
        var treeView = new StructureViewComponent(readOnly, fileTree.getFileSystem());
        layout.add(new StructureExplorerComponent(treeView));
        var tab = this.add("Structure", layout);
        return new Tuple2<>(tab, treeView);
    }

}
