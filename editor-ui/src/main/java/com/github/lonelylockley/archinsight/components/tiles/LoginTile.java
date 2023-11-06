package com.github.lonelylockley.archinsight.components.tiles;

import com.github.lonelylockley.archinsight.components.NotificationComponent;
import com.github.lonelylockley.archinsight.events.BaseListener;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.UserAuthenticatedEvent;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClickEvent;
import com.vaadin.flow.component.ComponentEventListener;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public class LoginTile extends SiteViewTile {

    private final LoginClickListener clickListener;

    public LoginTile(String loginUrl) {
        super("Sign in with Google", "static/google-178-svgrepo-com.svg", "#ff4e50", doubleWidth, singleHeight);
        getElement().setAttribute("router-ignore", true);
        setClassName("tile_action");
        clickListener = new LoginClickListener(loginUrl);
        addClickListener(clickListener);
        var authListener = new BaseListener<UserAuthenticatedEvent>() {
            @Override
            @Subscribe
            public void receive(UserAuthenticatedEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    flipTile(e.getUser());
                    new NotificationComponent("Please be advised, that all file storage features work in TEST MODE. You MUST backup all important source codes locally!", MessageLevel.NOTICE, 60000);
                }
            }
        };
        Communication.getBus().register(authListener);
        addDetachListener(e -> Communication.getBus().unregister(authListener));
    }

    public void flipTile(Userdata user) {
        setText(user.getDisplayName());
        setIcon(user.getAvatar());
        setColor("#04AA6D");
        getListeners(ClickEvent.class).clear();
        clickListener.disable();
    }

    private class LoginClickListener implements ComponentEventListener<ClickEvent<VerticalLayout>> {

        private final String loginUrl;
        private boolean enabled = true;

        public LoginClickListener(String loginUrl) {
            this.loginUrl = loginUrl;
        }

        @Override
        public void onComponentEvent(ClickEvent<VerticalLayout> event) {
            if (enabled) {
                getElement().executeJs(String.format("window.open('%s/oauth/login/google', '')", loginUrl));
            }
        }

        public void enable() {
            enabled = true;
        }

        public void disable() {
            enabled = false;
        }
    }

}
