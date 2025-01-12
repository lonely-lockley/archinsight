package com.github.lonelylockley.archinsight.events;

import java.util.UUID;

public class TabOpenEvent extends BaseEvent {

    private final String tabId;
    private final String name;
    private final UUID fileId;

    public TabOpenEvent(String tabId, UUID fileId, String name) {
        this.tabId = tabId;
        this.fileId = fileId;
        this.name = name;
    }

    public String getTabId() {
        return tabId;
    }

    public UUID getFileId() {
        return fileId;
    }

    public String getName() {
        return name;
    }
}
