package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.splitlayout.SplitLayout;

public class SplitViewComponent extends SplitLayout {

    public SplitViewComponent(Div left, Div right) {
        super(left, right);
        setOrientation(Orientation.HORIZONTAL);
        setSizeFull();
        setSplitterPosition(40);
    }
}
