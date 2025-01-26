package com.github.lonelylockley.archinsight.events;

import java.util.UUID;

public class TabUpdateEvent extends TabOpenEvent {

    public TabUpdateEvent(String tabId, UUID fileId, String name) {
        super(tabId, fileId, name);
    }

}
