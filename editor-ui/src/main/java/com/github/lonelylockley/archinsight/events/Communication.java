package com.github.lonelylockley.archinsight.events;

import com.google.common.eventbus.EventBus;
import com.vaadin.flow.component.ComponentEventBus;

public class Communication {

    private static EventBus bus = new EventBus();

    public static EventBus getBus() {
        return bus;
    }
}
