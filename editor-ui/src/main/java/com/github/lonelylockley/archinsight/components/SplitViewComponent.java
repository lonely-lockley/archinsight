package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.HtmlComponent;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.splitlayout.SplitLayout;
import elemental.json.JsonType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SplitViewComponent extends SplitLayout {

    private static final Logger logger = LoggerFactory.getLogger(SplitViewComponent.class);
    private static final double defaultSplitterPosition = 50.0;

    public SplitViewComponent(HtmlComponent left, HtmlComponent right) {
        super();
        setSizeFull();
        var svgBackground = new Div();
        svgBackground.add(right);
        svgBackground.getElement().getStyle().set("background-color", "#ffffff");
        addToPrimary(left);
        addToSecondary(svgBackground);
        setOrientation(Orientation.HORIZONTAL);
        setSizeFull();
        setSplitterPosition(defaultSplitterPosition);
        getSavedSplitterPosition();

        addSplitterDragendListener(e -> {
            saveSplitterPosition();
        });
    }

    private void getSavedSplitterPosition() {
        getElement().executeJs("return localStorage.getItem('org.archinsight.splitter.pos')").then(value -> {
            if (value.getType() != JsonType.NULL) {
                setSplitterPosition(value.asNumber());
            }
        });
    }

    private void saveSplitterPosition() {
        getElement().executeJs("return localStorage.setItem('org.archinsight.splitter.pos', $0)", getSplitterPosition());
    }
}
