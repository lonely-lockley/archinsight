package com.github.lonelylockley.archinsight.components.tiles;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.components.UserMenuComponent;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClickEvent;
import com.vaadin.flow.component.ComponentEventListener;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import org.apache.commons.lang3.text.WordUtils;

import java.util.function.Consumer;

public class LoginTile extends SiteViewTile {

    private static final String iconSrc = "static/google-178-svgrepo-com.svg";
    private static final String baseColor = "#ff4e50";

    private final LoginClickListener loginClickListener;
    private final LogoutClickListener logoutClickListener;
    private final Config conf;

    private Consumer<Userdata> listener = null;

    public LoginTile(Config conf) {
        super("Sign in with Google", iconSrc, baseColor, doubleWidth, singleHeight);
        this.conf = conf;
        getElement().setAttribute("router-ignore", true);
        setClassName("tile_action");
        makeTextBold();
        loginClickListener = new LoginClickListener(conf.getLoginUrl());
        addClickListener(loginClickListener);
        logoutClickListener = new LogoutClickListener();
        addClickListener(logoutClickListener);

        Communication.getBus().register(this,
                new BaseListener<UserAuthenticatedEvent>() {
                    @Override
                    @Subscribe
                    public void receive(UserAuthenticatedEvent e) {
                        e.withCurrentUI(this, () -> {
                            flipTile(e.getUser());
                        });
                    }
                });
    }

    public void onTileFlip(Consumer<Userdata> listener) {
        this.listener = listener;
    }

    public void flipTile(Userdata user) {
        setText(limitTextLength("Logout: " + user.getDisplayName(), 18));
        makeTextNormal();
        setIcon(user.getAvatar());
        setColor("var(--lumo-contrast-5pct)");
        loginClickListener.disable();
        logoutClickListener.enable();
        if (listener != null) {
            listener.accept(user);
        }
    }

    public void flipBackTile() {
        setText("Sign in with Google");
        makeTextBold();
        setIcon(iconSrc);
        setColor(baseColor);
        loginClickListener.enable();
        logoutClickListener.disable();
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

    private class LogoutClickListener implements ComponentEventListener<ClickEvent<VerticalLayout>> {
        private boolean enabled = false;

        @Override
        public void onComponentEvent(ClickEvent<VerticalLayout> event) {
            if (enabled) {
//                if (Authentication.authenticated()) {
//                    Communication.getBus().post(new RepositoryCloseEvent(FileChangeReason.CLOSED));
//                }
                flipBackTile();
                UI.getCurrent().getPage().executeJs("window.logoutFlow()");
                setVisible(false);
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
