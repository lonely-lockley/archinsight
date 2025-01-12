package com.github.lonelylockley.archinsight.events;

import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.UI;

public abstract class BaseEvent {

    private final UI ui = UI.getCurrent();

    public String getSessionId() {
        return ui.getSession().getSession().getId();
    }

    public int getUiId() {
        return ui.getUIId();
    }

    public UI getUIContext() {
        return ui;
    }

}
