package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.BaseListener;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.github.lonelylockley.archinsight.events.ZoomEvent;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.*;
import com.vaadin.flow.component.dependency.JsModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Tag("div")
@JsModule("./src/PanZoomControl.ts")
public class SVGViewComponent extends HtmlContainer implements ClickNotifier<SVGViewComponent> {

    private static final Logger logger = LoggerFactory.getLogger(SVGViewComponent.class);

    public SVGViewComponent() {
        setId("svg-view-component");
        final var svgDataListener = new BaseListener<SvgDataEvent>() {
            @Override
            @Subscribe
            public void receive(SvgDataEvent e) {
                if (checkUiAndSession(e)) {
                    getElement().setProperty("innerHTML", filterSVG(e.getSvgData()));
                    UI.getCurrent().getPage().executeJs("zoomRestore()");
                }
            }
        };
        Communication.getBus().register(svgDataListener);
        final var zoomEventListener = new BaseListener<ZoomEvent>() {
            @Override
            @Subscribe
            public void receive(ZoomEvent e) {
                if (checkUiAndSession(e)) {
                    if (e.isZoomIn()) {
                        UI.getCurrent().getPage().executeJs("zoomIn()");
                    }
                    else
                    if (e.isZoomOut()) {
                        UI.getCurrent().getPage().executeJs("zoomOut()");
                    }
                    else
                    if (e.isFit()) {
                        UI.getCurrent().getPage().executeJs("zoomFit($0)", 1036);
                    }
                    else {
                        UI.getCurrent().getPage().executeJs("zoomReset()");
                    }
                }
            }
        };
        Communication.getBus().register(zoomEventListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(svgDataListener);
            Communication.getBus().unregister(zoomEventListener);
        });
    }

    private String filterSVG(String svgData) {
        return svgData.replaceFirst("<svg", "<svg id=\"svg_render\" version=\"1.1\"");
    }

}
