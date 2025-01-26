package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.screens.EditorView;
import com.github.lonelylockley.archinsight.screens.SiteView;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClickEvent;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.contextmenu.MenuItem;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.html.Image;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.SvgIcon;
import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.server.StreamResource;

@JsModule("./src/remote/LoginCallback.js")
public class UserMenuComponent extends MenuBar {

    private static final String iconSrc = "/icons/user-svgrepo-com.svg";

    private final SvgIcon icon = new SvgIcon(new StreamResource("user-svgrepo-com.svg", () -> this.getClass().getResourceAsStream(iconSrc)));
    private final Image userpic = new Image(iconSrc, "-");
    private final Span username = new Span("User");
    private final Config conf = MicronautContext.getInstance().getConf();
    private final MenuItem login;
    private final MenuItem editor;
    private final MenuItem logout;

    public UserMenuComponent() {
        setId("content-presentation"); // for LoginCallback.js to initialize and work properly
        getStyle().set("margin-right", "10px");
        setThemeName("");
        userpic.setHeight("24px");
        userpic.setWidth("24px");
        userpic.setVisible(false);
        userpic.setClassName("app-userpic");
        username.getStyle()
                .set("margin-top", "3px")
                .set("margin-left", "3px")
                .set("color", "var(--lumo-body-text-color)");
        var container =new HorizontalLayout(icon, userpic, username);
        container.setSpacing(false);
        var item = addItem(container);
        var sub = item.getSubMenu();
        editor = sub.addItem("My projects");
        editor.setId("user_menu_editor");
        editor.setVisible(false);
        logout = sub.addItem("Sign out");
        logout.setId("user_menu_logout");
        login = sub.addItem("Sign in with Google");
        login.setId("user_menu_login");
        if (Authentication.authenticated()) {
            var user = Authentication.getAuthenticatedUser();
            userpic.setSrc(user.getAvatar());
            icon.setVisible(false);
            userpic.setVisible(true);
            username.setText(user.getDisplayName());
            login.setVisible(false);
            logout.setVisible(true);
            if (Authentication.playgroundModeEnabled()) {
                editor.setVisible(true);
            }
        }
        else {
            login.setVisible(true);
            logout.setVisible(false);
        }
        if (conf.getDevMode() && !Authentication.authenticated()) {
            var testLogin = sub.addItem("Test login");
            testLogin.setId("user_menu_test_login");
            testLogin.getElement().getStyle().set("background-color", "#ffffff").set("color", "#000000");
            testLogin.addClickListener(this::debugClickListener);
        }
        editor.addClickListener(e -> {
            UI.getCurrent().navigate(EditorView.class);
        });
        login.addClickListener(this::googleClickListener);
        logout.addClickListener(e -> {
            if (Authentication.authenticated()) {
                if (!Authentication.playgroundModeEnabled()) {
                    Communication.getBus().post(new RepositoryCloseEvent(FileChangeReason.CLOSED));
                }
                Authentication.deauthenticate();
            }
            loggedOut();
            if (Authentication.playgroundModeEnabled()) {
                UI.getCurrent().getPage().reload();
            }
            else {
                UI.getCurrent().getPage().setLocation("/");
            }
        });

        if (Authentication.playgroundModeEnabled()) {
            final var fileCloseListener = new BaseListener<CreateRepositoryEvent>() {
                @Override
                @Subscribe
                public void receive(CreateRepositoryEvent e) {
                    if (eventWasProducedForCurrentUiId(e)) {
                        if (conf.getDevMode()) {
                            debugClickListener(null);
                        }
                        else {
                            googleClickListener(null);
                        }
                    }
                }
            };
            Communication.getBus().register(fileCloseListener);
            addDetachListener(e -> {
                Communication.getBus().unregister(fileCloseListener);
            });
        }
    }

    private void googleClickListener(ClickEvent<?> e) {
        getElement().executeJs(String.format("window.open('%s/oauth/login/google', '')", conf.getLoginUrl()));
    }

    private void debugClickListener(ClickEvent<?> e) {
        getElement().executeJs(String.format("window.open('%s/auth/testOk', '')", conf.getLoginUrl()));
    }

    public void loggedIn() {
        assert Authentication.authenticated();
        var user = Authentication.getAuthenticatedUser();
        userpic.setSrc(user.getAvatar());
        userpic.setVisible(true);
        icon.setVisible(false);
        username.setText(user.getDisplayName());
        login.setVisible(false);
        logout.setVisible(true);
        if (Authentication.playgroundModeEnabled()) {
            editor.setVisible(true);
        }
    }

    public void loggedOut() {
        assert !Authentication.authenticated();
        icon.setVisible(true);
        userpic.setVisible(false);
        username.setText("User");
        login.setVisible(true);
        logout.setVisible(false);
        editor.setVisible(false);
    }

    @ClientCallable
    public void loginCallback() {
        // called from browser when login sequence finishes
        if (Authentication.authenticated()) {
            Communication.getBus().post(new UserAuthenticatedEvent(Authentication.getAuthenticatedUser()));
            loggedIn();
            UI.getCurrent().navigate(EditorView.class);
        }
    }
}
