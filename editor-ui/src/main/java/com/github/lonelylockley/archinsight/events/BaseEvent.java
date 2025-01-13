package com.github.lonelylockley.archinsight.events;

import com.vaadin.flow.component.UI;
import com.vaadin.flow.server.Command;

public abstract class BaseEvent {

    private final UI ui = UI.getCurrent();

    public void withCurrentUI(BaseListener<?> listener, Command action) {
        if (ui.getUIId() == listener.getUiId()) {
            ui.access(action);
        }
    }

}
