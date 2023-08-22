package com.github.lonelylockley.archinsight.events;

public class ZoomEvent {

    private ZoomEventType type = ZoomEventType.RESET;

    public ZoomEvent zoomIn() {
        type = ZoomEventType.ZOOM_IN;
        return this;
    }

    public ZoomEvent zoomOut() {
        type = ZoomEventType.ZOOM_OUT;
        return this;
    }

    public ZoomEvent reset() {
        type = ZoomEventType.RESET;
        return this;
    }

    public boolean isZoomIn() {
        return type == ZoomEventType.ZOOM_IN;
    }

    public boolean isZoomOut() {
        return type == ZoomEventType.ZOOM_OUT;
    }

    public boolean isReset() {
        return type == ZoomEventType.RESET;
    }

    private enum ZoomEventType {
        ZOOM_IN,
        ZOOM_OUT,
        RESET
    }
}
