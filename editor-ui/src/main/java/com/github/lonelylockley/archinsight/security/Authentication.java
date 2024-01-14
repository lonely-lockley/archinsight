package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.server.VaadinServletRequest;
import com.vaadin.flow.server.VaadinServletResponse;
import com.vaadin.flow.server.VaadinSession;
import jakarta.servlet.http.Cookie;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

public class Authentication {

    private static final String pg_attribute = "playground_mode";

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

    private static Map<Integer, Boolean> getPgModeOrCreate(VaadinSession session) {
        var attr = (HashMap<Integer, Boolean>) session.getAttribute(pg_attribute);
        if (attr == null) {
            attr = new HashMap<>();
            session.setAttribute(pg_attribute, attr);
        }
        return attr;
    }

    public static void enablePlaygroundMode() {
        var session = VaadinSession.getCurrent();
        var pg = getPgModeOrCreate(session);
        pg.put(UI.getCurrent().getUIId(), true);
    }

    public static boolean playgroundModeEnabled() {
        var session = VaadinSession.getCurrent();
        var pg = getPgModeOrCreate(session);
        return pg.get(UI.getCurrent().getUIId()) != null;
    }

    public static void disablePlaygroundMode() {
        var session = VaadinSession.getCurrent();
        var pg = getPgModeOrCreate(session);
        pg.remove(UI.getCurrent().getUIId());
    }

    public static void authenticate() {
        new AuthFilter().beforeEnter(null);
    }

    public static void deauthenticate() {
        var session = VaadinSession.getCurrent();
        assert session != null;
        session.setAttribute(Userdata.class, null);
        clearAuthToken();
    }

    public static void clearAuthToken() {
        var response = VaadinServletResponse.getCurrent();
        assert response != null;
        var accessTokenReset = new Cookie("auth_token", "");
        accessTokenReset.setPath("/");
        accessTokenReset.setHttpOnly(true);
        accessTokenReset.setMaxAge(0);
        response.addCookie(accessTokenReset);
    }

}
