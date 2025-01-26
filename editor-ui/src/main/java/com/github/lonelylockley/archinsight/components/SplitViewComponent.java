package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.ViewMode;
import com.vaadin.flow.component.HtmlComponent;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.splitlayout.SplitLayout;
import com.vaadin.flow.dom.Style;
import elemental.json.JsonType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SplitViewComponent extends SplitLayout {

    private static final Logger logger = LoggerFactory.getLogger(SplitViewComponent.class);
    private static final double defaultSplitterPosition = 50;

    private final HtmlComponent left;
    private final HtmlComponent right;

    public SplitViewComponent(HtmlComponent left, HtmlComponent right) {
        super();
        this.left = left;
        this.right = right;
        setSizeFull();
        var svgBackground = new Div();
        svgBackground.add(right);
        addToPrimary(left);
        addToSecondary(svgBackground);
        setOrientation(Orientation.HORIZONTAL);
        setSizeFull();
        getSavedSplitterPosition();

        addSplitterDragendListener(e -> {
            saveSplitterPosition();
        });
    }

    public void displayRightOnly() {
        left.getElement().getStyle().setDisplay(Style.Display.NONE);
        right.getElement().getStyle().remove("display");
        setSplitterPosition(0);
        getElement().executeJs(
            "this.shadowRoot.querySelector('[part=\"splitter\"]').style.display = 'none'"
        );
    }

    public void displayLeftOnly() {
        left.getElement().getStyle().remove("display");
        right.getElement().getStyle().setDisplay(Style.Display.NONE);
        setSplitterPosition(100);
        getElement().executeJs(
                "this.shadowRoot.querySelector('[part=\"splitter\"]').style.display = 'none'"
        );
    }

    public void displayBoth() {
        left.getElement().getStyle().remove("display");
        right.getElement().getStyle().remove("display");
        getSavedSplitterPosition();
        getElement().executeJs(
                "this.shadowRoot.querySelector('[part=\"splitter\"]').style.removeProperty('display')"
        );
    }

    private void getSavedSplitterPosition() {
        getElement().executeJs("return localStorage.getItem('org.archinsight.splitter.pos')").then(value -> {
            if (value.getType() != JsonType.NULL) {
                setSplitterPosition(value.asNumber());
            }
            else {
                setSplitterPosition(defaultSplitterPosition);
            }
        });
    }

    private void saveSplitterPosition() {
        getElement().executeJs("return localStorage.setItem('org.archinsight.splitter.pos', $0)", getSplitterPosition());
    }
}
