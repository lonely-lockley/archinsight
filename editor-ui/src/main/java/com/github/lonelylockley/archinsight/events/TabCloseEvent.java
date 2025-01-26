package com.github.lonelylockley.archinsight.events;

public class TabCloseEvent extends BaseEvent {

    private final String tabId;

    public TabCloseEvent(String tabId) {
        this.tabId = tabId;
    }

    public String getTabId() {
        return tabId;
    }

}
