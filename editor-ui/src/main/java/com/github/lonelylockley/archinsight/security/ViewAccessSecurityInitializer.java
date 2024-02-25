package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.screens.SiteView;
import com.vaadin.flow.server.ServiceInitEvent;
import com.vaadin.flow.server.VaadinServiceInitListener;
import com.vaadin.flow.server.auth.DefaultAccessCheckDecisionResolver;
import com.vaadin.flow.server.auth.NavigationAccessControl;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class ViewAccessSecurityInitializer implements VaadinServiceInitListener {

    private static final Logger logger = LoggerFactory.getLogger(ViewAccessSecurityInitializer.class);

    private final NavigationAccessControl accessControl;

    public ViewAccessSecurityInitializer() {
        accessControl = new NavigationAccessControl(List.of(new AccessChecker()), new DefaultAccessCheckDecisionResolver());
        accessControl.setLoginView(SiteView.class);
        logger.info("Initialized access control checker");
    }

    @Override
    public void serviceInit(ServiceInitEvent serviceInitEvent) {
        serviceInitEvent.getSource().addUIInitListener(uiInitEvent -> {
            var ui = uiInitEvent.getUI();
            var authFilter = new AuthFilter();
            ui.addBeforeEnterListener(authFilter);
            ui.addHeartbeatListener(authFilter);
            ui.addBeforeEnterListener(accessControl);
        });
    }
}
