package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.server.VaadinServletRequest;
import com.vaadin.flow.server.VaadinServletResponse;
import com.vaadin.flow.server.VaadinSession;

import javax.servlet.http.Cookie;
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

    public static void enablePlaygroundMode() {
        var session = VaadinSession.getCurrent();
        session.setAttribute("playground_mode", true);
    }

    public static boolean playgroundModeEnabled() {
        var session = VaadinSession.getCurrent();
        var pgMode = session.getAttribute("playground_mode");
        return pgMode != null;
    }

    public static void disablePlaygroundMode() {
        var session = VaadinSession.getCurrent();
        session.setAttribute("playground_mode", null);
    }

    public static void authenticate() {
        new AuthFilter().beforeEnter(null);
    }

    public static void deauthenticate() {
        var session = VaadinSession.getCurrent();
        assert session != null;
        session.setAttribute(Userdata.class, null);
        var response = VaadinServletResponse.getCurrent();
        assert response != null;
        var accessTokenReset = new Cookie("auth_token", "");
        accessTokenReset.setMaxAge(0);
        response.addCookie(accessTokenReset);
        UI.getCurrent().getSession().close();
    }

}
