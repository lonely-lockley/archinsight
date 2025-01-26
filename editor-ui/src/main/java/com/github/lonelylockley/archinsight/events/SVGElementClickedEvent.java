package com.github.lonelylockley.archinsight.events;

public class SVGElementClickedEvent extends BaseEvent {

    private final String elementId;

    public SVGElementClickedEvent(String elementId) {
        this.elementId = elementId;
    }

    public String getElementId() {
        return elementId;
    }
}
