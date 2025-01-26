package com.github.lonelylockley.archinsight.events;

import com.google.common.eventbus.AsyncEventBus;
import com.google.common.eventbus.EventBus;
import com.vaadin.flow.component.DetachNotifier;
import com.vaadin.flow.component.UI;

import java.util.concurrent.Executors;

public class Communication {

    private final EventBus bus;

    private Communication(String sessionId) {
        bus = new AsyncEventBus("bus-instance-" + sessionId, Executors.newVirtualThreadPerTaskExecutor());
    }

    public static Communication getBus() {
        var session = UI.getCurrent().getSession();
        var res = session.getAttribute(Communication.class);
        if (res == null) {
            res = new Communication(session.getSession().getId());
            session.setAttribute(Communication.class, res);
        }
        return res;
    }

    public void register(final DetachNotifier finalizer, final BaseListener<?>... listeners) {
        for (BaseListener<?> listener : listeners) {
            bus.register(listener);
        }
        finalizer.addDetachListener(e -> {
            for (BaseListener<?> listener : listeners) {
                bus.unregister(listener);
            }
        });
    }

    public void post(Object event) {
        if (event instanceof BaseEvent) {
            bus.post(event);
        }
        else {
            throw new IllegalArgumentException("Events MUST extends BaseEvent class");
        }
    }

}
