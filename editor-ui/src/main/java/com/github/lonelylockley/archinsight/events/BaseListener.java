package com.github.lonelylockley.archinsight.events;

import com.vaadin.flow.component.UI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public abstract class BaseListener<T extends BaseEvent> {

    private static final Logger logger = LoggerFactory.getLogger(BaseListener.class);
    private final int uiId = UI.getCurrent().getUIId();

    public abstract void receive(T e);

    protected int getUiId() {
        return uiId;
    }
}
