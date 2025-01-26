package com.github.lonelylockley.archinsight.events;

public class ViewModeEvent extends BaseEvent {

    private ViewMode mode;

    public ViewModeEvent(ViewMode mode) {
        this.mode = mode;
    }

    public ViewMode getMode() {
        return mode;
    }
}
