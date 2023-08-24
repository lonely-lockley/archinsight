package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.components.MenuBarComponent;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.UI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

public abstract class BaseListener<T> {

    private static final Logger logger = LoggerFactory.getLogger(BaseListener.class);

    private final String sessionId = UI.getCurrent().getSession().getSession().getId();
    private final int uiId = UI.getCurrent().getUIId();

    public abstract void receive(T e);

    protected boolean checkUiAndSession(T event) {
        if (event instanceof BaseEvent typedEvent) {
            return sessionId.equals(typedEvent.getSessionId()) && typedEvent.getUiId() == uiId;
        }
        else {
            logger.warn("Dispatching event that is not tied up with uiId and session {}", event);
            return false;
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        BaseListener<?> that = (BaseListener<?>) o;
        return uiId == that.uiId && Objects.equals(sessionId, that.sessionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(sessionId, uiId);
    }
}
