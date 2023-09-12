package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.vaadin.flow.server.VaadinServletRequest;
import com.vaadin.flow.server.VaadinSession;

import java.util.Arrays;

public class Authentication {

    public static boolean authenticated() {
        var session = VaadinSession.getCurrent();
        if (session == null) {
            return false;
        }
        return session.getAttribute(Userdata.class) != null;
    }

    public static Userdata getAuthenticatedUser() {
        var session = VaadinSession.getCurrent();
        assert session != null;
        var user = session.getAttribute(Userdata.class);
        assert user != null;
        return user;
    }

    public static boolean completedLogin() {
        var request = VaadinServletRequest.getCurrent();
        if (request == null) {
            return false;
        }
        var token = Arrays.stream(request.getCookies()).filter(c -> "auth_token".equals(c.getName())).findAny();
        return token.isPresent();
    }

    public static void authenticate() {
        new AuthFilter().beforeEnter(null);
    }

}
