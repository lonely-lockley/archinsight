package com.github.lonelylockley.archinsight.events;

import com.vaadin.flow.component.UI;
import com.vaadin.flow.router.Router;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

public abstract class BaseListener<T> {

    private static final Logger logger = LoggerFactory.getLogger(BaseListener.class);
    private final int uiId = UI.getCurrent().getUIId();
    /*
     * views can create same listeners for different locations. we have to tell one from another
     */
    private final Class activeView = getCurrentView();

    public abstract void receive(T e);

    private Class getCurrentView() {
        var chain = UI.getCurrent().getInternals().getActiveRouterTargetsChain();
        if (chain.size() > 0) {
            return chain.get(0).getClass();
        }
        else {
            return null;
        }
    }

    protected boolean eventWasProducedForCurrentUiId(T event) {
        if (event instanceof BaseEvent typedEvent) {
            return typedEvent.getUiId() == uiId;
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
        return uiId == that.uiId && Objects.equals(activeView, that.activeView);
    }

    @Override
    public int hashCode() {
        return Objects.hash(uiId, activeView);
    }

}
