package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.*;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.*;
import com.vaadin.flow.component.dependency.JsModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

@Tag("div")
@JsModule("./src/PanZoomControl.ts")
public class SVGViewComponent extends HtmlContainer implements ClickNotifier<SVGViewComponent> {

    private static final Logger logger = LoggerFactory.getLogger(SVGViewComponent.class);

    private final String id;
    private final String svgTag;

    private boolean hasImage = false;

    public SVGViewComponent() {
        this.id = String.format("svg-view-component-%s", UUID.randomUUID());
        this.svgTag = String.format("<svg id=\"%s\" version=\"1.1\"", id);
    }

    private String filterSVG(String svgData) {
        return svgData.replaceFirst("<svg", svgTag);
    }

    public void reset() {
        hasImage = false;
        getElement().setProperty("innerHTML", "");
    }

    public void update(String svgData) {
        hasImage = true;
        getElement().setProperty("innerHTML", filterSVG(svgData));
        UI.getCurrent().getPage().executeJs("zoomRestore($0)", id);
    }

    public void zoom(ZoomEvent e) {
        if (e.isZoomIn()) {
            UI.getCurrent().getPage().executeJs("zoomIn($0)", id);
        }
        else
        if (e.isZoomOut()) {
            UI.getCurrent().getPage().executeJs("zoomOut($0)", id);
        }
        else
        if (e.isFit()) {
            UI.getCurrent().getPage().executeJs("zoomFit($0, $1)", id, 1036);
        }
        else {
            UI.getCurrent().getPage().executeJs("zoomReset($0)", id);
        }
    }

    public boolean hasImage() {
        return hasImage;
    }
}
