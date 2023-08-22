package com.github.lonelylockley.archinsight.components;

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

        Communication.getBus().register(new Object() {
            @Subscribe
            public void receiveSvgData(SvgDataEvent e) {
                getElement().setProperty("innerHTML", filterSVG(e.getSvgData()));
            }
        });

        Communication.getBus().register(new Object() {
            @Subscribe
            public void receiveZoomEvent(ZoomEvent e) {
                if (e.isZoomIn()) {
                    UI.getCurrent().getPage().executeJs("zoomIn()");
                }
                else
                if (e.isZoomOut()) {
                    UI.getCurrent().getPage().executeJs("zoomOut()");
                }
                else {
                    UI.getCurrent().getPage().executeJs("reset()");
                }
            }
        });

    }

    private String filterSVG(String svgData) {
        return svgData.replaceFirst("<svg", "<svg id=\"svg_render\" version=\"1.1\"");
    }

}
