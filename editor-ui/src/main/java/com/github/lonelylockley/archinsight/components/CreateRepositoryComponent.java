package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.tiles.DevModeLocalLoginTile;
import com.github.lonelylockley.archinsight.components.tiles.LoginTile;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.UserAuthenticatedEvent;
import com.github.lonelylockley.archinsight.screens.EditorView;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.component.menubar.MenuBarVariant;

@JsModule("./src/remote/LoginCallback.ts")
public class CreateRepositoryComponent extends MenuBar {

    public CreateRepositoryComponent() {
        setId("content-presentation"); // for LoginCallback.ts to initialize and work properly
        var conf = MicronautContext.getInstance().getConf();
        addThemeVariants(MenuBarVariant.LUMO_PRIMARY);
        var item = addItem("Create own repository");
        item.setId("menu_btn_create_acc");
        var signinSubMenu = item.getSubMenu();
        var login = new LoginTile(conf.getLoginUrl());
        login.setColor("#0c6ce9");
        signinSubMenu.add(login);
        if (Authentication.authenticated()) {
            login.flipTile(Authentication.getAuthenticatedUser());
        }
        if (conf.getDevMode()) {
            signinSubMenu.add(new DevModeLocalLoginTile(conf.getLoginUrl()));
        }
    }

    @ClientCallable
    public void loginCallback() {
        // called from browser when login sequence finishes
        if (Authentication.completedLogin()) {
            Authentication.authenticate();
            if (Authentication.authenticated()) {
                Communication.getBus().post(new UserAuthenticatedEvent(Authentication.getAuthenticatedUser()));
                UI.getCurrent().navigate(EditorView.class);
            }
        }
    }

}
