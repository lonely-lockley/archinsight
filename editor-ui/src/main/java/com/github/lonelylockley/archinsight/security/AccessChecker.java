package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.vaadin.flow.server.VaadinRequest;
import com.vaadin.flow.server.VaadinSession;
import com.vaadin.flow.server.auth.ViewAccessChecker;

import java.security.Principal;
import java.util.function.Function;

public class AccessChecker extends ViewAccessChecker {

    @Override
    protected Principal getPrincipal(VaadinRequest request) {
        var user = VaadinSession.getCurrent().getAttribute(Userdata.class);
        if (user == null) {
            return null;
        }
        else {
            return new UserPrincipal(user);
        }
    }

    @Override
    protected Function<String, Boolean> getRolesChecker(VaadinRequest request) {
        return "user"::equals; // any logged-in user has only one role at this time. must be extended later
    }
}
