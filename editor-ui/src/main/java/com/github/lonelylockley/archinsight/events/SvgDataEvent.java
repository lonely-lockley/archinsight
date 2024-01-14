package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.components.EditorComponent;
import com.vaadin.flow.component.ComponentEvent;

public class SvgDataEvent extends BaseEvent {

    private String tabId;
    private String svgData;

    public SvgDataEvent(String tabId, String svgData) {
        this.tabId = tabId;
        this.svgData = svgData;
    }

    public String getSvgData() {
        return svgData;
    }

    public String getTabId() {
        return tabId;
    }
}
