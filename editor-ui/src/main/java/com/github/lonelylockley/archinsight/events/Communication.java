package com.github.lonelylockley.archinsight.events;

import com.google.common.eventbus.EventBus;
import com.vaadin.flow.component.UI;

import java.util.HashSet;
import java.util.Set;

public class Communication {

    private final EventBus bus;

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
        bus.register(listener);
    }

    public void unregister(BaseListener<?> listener) {
        bus.unregister(listener);
    }

    public void post(Object event) {
        bus.post(event);
    }
}
