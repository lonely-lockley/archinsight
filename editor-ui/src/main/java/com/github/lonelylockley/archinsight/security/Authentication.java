package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.Userdata;
import com.vaadin.flow.server.VaadinServletRequest;
import com.vaadin.flow.server.VaadinSession;

import java.util.Arrays;

public class Authentication {

    public static boolean authenticated() {
        return VaadinSession.getCurrent().getAttribute(Userdata.class) != null;
    }

    public static Userdata getAuthenticatedUser() {
        var user = VaadinSession.getCurrent().getAttribute(Userdata.class);
        assert user != null;
        return user;
    }

    public static boolean completedLogin() {
        var request = VaadinServletRequest.getCurrent();
        var token = Arrays.stream(request.getCookies()).filter(c -> "auth_token".equals(c.getName())).findAny();
        return token.isPresent();
    }

    public static void authenticate() {
        new AuthFilter().beforeEnter(null);
    }

}
