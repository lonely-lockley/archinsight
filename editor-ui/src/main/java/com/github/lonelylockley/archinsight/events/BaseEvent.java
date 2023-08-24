package com.github.lonelylockley.archinsight.events;

import com.vaadin.flow.component.UI;

public abstract class BaseEvent {

    private final String sessionId = UI.getCurrent().getSession().getSession().getId();
    private final int uiId = UI.getCurrent().getUIId();

    public String getSessionId() {
        return sessionId;
    }

    public int getUiId() {
        return uiId;
    }
}
