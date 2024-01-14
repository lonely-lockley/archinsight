package com.github.lonelylockley.archinsight.security;

import com.vaadin.flow.server.auth.AccessAnnotationChecker;
import com.vaadin.flow.server.auth.AccessCheckResult;
import com.vaadin.flow.server.auth.NavigationAccessChecker;
import com.vaadin.flow.server.auth.NavigationContext;
import jakarta.annotation.security.DenyAll;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AccessChecker implements NavigationAccessChecker {

    private static final Logger logger = LoggerFactory.getLogger(AccessChecker.class);

    private final AccessAnnotationChecker accessAnnotationChecker = new AccessAnnotationChecker();

    @Override
    public AccessCheckResult check(NavigationContext context) {
        Class<?> targetView = context.getNavigationTarget();
        final var user = Authentication.getAuthenticatedUser();
        // very strange, but principal is checked for null only in `hasAccess` and never used ever after
        boolean hasAccess = accessAnnotationChecker.hasAccess(targetView, user == null ? null : new UserPrincipal(user), this::checkRoles);
        logger.debug("Access to view '{}' with path '{}' is {}",
                context.getNavigationTarget().getName(),
                context.getLocation().getPath(),
                ((hasAccess) ? "allowed" : "denied")
        );
        if (hasAccess) {
            return context.allow();
        }
        String denyReason;
        if (isImplicitlyDenyAllAnnotated(targetView)) {
            denyReason = "Consider adding one of the following annotations to make the view accessible: @AnonymousAllowed, @PermitAll, @RolesAllowed";
        }
        else {
            denyReason = "Access is denied by annotations on the view.";
        }
        return context.deny(denyReason);
    }

    private boolean isImplicitlyDenyAllAnnotated(Class<?> targetView) {
        return !(targetView.isAnnotationPresent(DenyAll.class)
                || targetView.isAnnotationPresent(PermitAll.class)
                || targetView.isAnnotationPresent(RolesAllowed.class));
    }

    protected boolean checkRoles(String requiredRole) {
        return "user".equals(requiredRole); // any logged-in user has only one role at this time. must be extended later
    }
}
