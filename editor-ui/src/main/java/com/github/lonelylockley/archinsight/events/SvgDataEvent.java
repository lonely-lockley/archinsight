package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.components.EditorComponent;
import com.vaadin.flow.component.ComponentEvent;

public class SvgDataEvent extends BaseEvent {

    private String svgData;

    public SvgDataEvent(String svgData) {
        this.svgData = svgData;
    }

    public String getSvgData() {
        return svgData;
    }

}
