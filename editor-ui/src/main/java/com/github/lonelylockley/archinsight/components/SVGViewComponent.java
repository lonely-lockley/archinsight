package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClickNotifier;
import com.vaadin.flow.component.HtmlContainer;
import com.vaadin.flow.component.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Tag("svg")
public class SVGViewComponent extends HtmlContainer implements ClickNotifier<SVGViewComponent> {

    private static final Logger logger = LoggerFactory.getLogger(SVGViewComponent.class);

    public SVGViewComponent() {
        setId("svg");
        getElement().setAttribute("xmlns", "http://www.w3.org/2000/svg");
        getElement().setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        getElement().setAttribute("transform", "scale(1)");

        Communication.getBus().register(new Object() {
            @Subscribe
            public void receiveSvgData(SvgDataEvent e) {
                getElement().setProperty("innerHTML", e.getSvgData());
            }
        });

    }

}
