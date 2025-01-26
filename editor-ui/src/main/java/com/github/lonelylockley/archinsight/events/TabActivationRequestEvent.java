package com.github.lonelylockley.archinsight.events;

public class TabActivationRequestEvent extends BaseEvent {

    private String tabId;

    public TabActivationRequestEvent(String tabId) {
        this.tabId = tabId;
    }

    public String getTabId() {
        return tabId;
    }
}
