package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.screens.SiteView;
import com.vaadin.flow.server.ServiceInitEvent;
import com.vaadin.flow.server.VaadinServiceInitListener;
import com.vaadin.flow.server.auth.ViewAccessChecker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ViewAccessSecurityInitializer implements VaadinServiceInitListener {

    private static final Logger logger = LoggerFactory.getLogger(ViewAccessSecurityInitializer.class);

    private AccessChecker accessChecker;

    public ViewAccessSecurityInitializer() {
        accessChecker = new AccessChecker();
        accessChecker.setLoginView(SiteView.class);
        accessChecker.enable();
        logger.info("Initialized view access security checker");
    }

    @Override
    public void serviceInit(ServiceInitEvent serviceInitEvent) {
        serviceInitEvent.getSource().addUIInitListener(uiInitEvent -> {
            uiInitEvent.getUI().addBeforeEnterListener(new AuthFilter());
            uiInitEvent.getUI().addBeforeEnterListener(accessChecker);
        });
    }
}
