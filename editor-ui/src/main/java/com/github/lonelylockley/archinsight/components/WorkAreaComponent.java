package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.splitlayout.SplitLayout;

public class WorkAreaComponent extends VerticalLayout {

    public WorkAreaComponent(MenuBar menu, SplitLayout splitPane) {
        setSizeFull();
        add(menu);
        add(splitPane);
    }
}
