package com.github.lonelylockley.archinsight.events;

import com.google.common.eventbus.EventBus;
import com.vaadin.flow.component.UI;

import java.util.HashSet;
import java.util.Set;

public class Communication {

    private final EventBus bus;
    /*
     * We have to store own subscriber collision list, cause
     * this bus implementation checks registered subscribers with `==`
     * instead of calling `equals` method causing duplicate subscribers if
     * a user opens several browser tabs
     */
    private final Set<BaseListener<?>> registered = new HashSet<>();

    private Communication(String sessionId) {
        bus = new EventBus("bus-instance-" + sessionId);
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

    public void register(BaseListener<?> listener) {
        if (!registered.contains(listener)) {
            registered.add(listener);
            bus.register(listener);
        }
    }

    public void unregister(BaseListener<?> listener) {
        if (registered.contains(listener)) {
            registered.remove(listener);
            bus.unregister(listener);
        }
    }

    public void post(Object event) {
        bus.post(event);
    }
}
