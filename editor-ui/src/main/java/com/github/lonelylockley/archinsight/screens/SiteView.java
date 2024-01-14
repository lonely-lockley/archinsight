package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.tiles.*;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.UserAuthenticatedEvent;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.Text;
import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Image;
import com.vaadin.flow.component.orderedlayout.FlexLayout;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.*;
import com.vaadin.flow.server.auth.AnonymousAllowed;
import org.apache.commons.io.IOUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;

@Route("")
@PageTitle("Archinsight")
@AnonymousAllowed
@JsModule("./src/remote/LoginCallback.ts")
public class SiteView extends VerticalLayout implements BaseView {

    private static final Logger logger = LoggerFactory.getLogger(SiteView.class);

    private static final int grossContentWidth = 1350;
    private static final String marginLeft = "150px";

    private final Config conf;

    public SiteView() {
        this.conf = MicronautContext.getInstance().getConf();
        setId("content-presentation");
        setAlignItems(Alignment.CENTER);
        var holder = new Div();
        holder.setWidth(grossContentWidth, Unit.PIXELS);
        var greeting = createGreeting();
        holder.add(greeting);
        var content = createContent();
        holder.add(content);
        setSizeFull();
        add(holder);
        addFooter(this);
        applyDarkTheme(getElement());
    }

    private Component createContent() {
        var content = new VerticalLayout();
        content.setMargin(false);
        content.getElement().getStyle().set("margin-left", marginLeft);
        content.setPadding(false);
        // code background =============================================================================================
        var bg = new Div();
        bg.setClassName("bg_code");
        try {
            bg.getElement().setProperty("innerHTML", IOUtils.toString(this.getClass().getResourceAsStream("/background.html"), StandardCharsets.UTF_8));
        }
        catch (Exception ex) {
            logger.error("Could not load site background", ex);
        }
        // project motivation ==========================================================================================
        var lb = new Div();
        lb.getElement().getStyle()
                .set("text-align", "justify")
                .set("font-size", "var(--lumo-font-size-l)")
                .set("margin-left", "10px");
        try {
            lb.getElement().setProperty("innerHTML", IOUtils.toString(this.getClass().getResourceAsStream("/description.html"), StandardCharsets.UTF_8));
        }
        catch (Exception ex) {
            logger.error("Could not load site description", ex);
        }
        var actionsFirstLine = new HorizontalLayout();
        actionsFirstLine.setMargin(false);
        // unused currently
//        var actionsSecondLine = new HorizontalLayout();
//        actionsSecondLine.setMargin(false);
        var actionsThirdLine = new HorizontalLayout();
        actionsThirdLine.setMargin(false);
        var actionsFourthLine = new HorizontalLayout();
        actionsFourthLine.setMargin(false);
        // first line actions =========================================================================================
        var loginFirstLine = new LoginTile(conf.getLoginUrl());
        var editor = new EditorTile();
        editor.setVisible(false);
        actionsFirstLine.add(loginFirstLine);
        actionsFirstLine.add(editor);
        actionsFirstLine.add(new PlaygroundTile());
        // logout actions ==============================================================================================
        var logoutFirstLine = new LoginTile(conf.getLoginUrl());
        logoutFirstLine.setWidth(LoginTile.singleWidth, Unit.PIXELS);
        logoutFirstLine.setVisible(false);
        actionsFirstLine.add(logoutFirstLine);
        loginFirstLine.onTileFlip(e -> {
            if (Authentication.authenticated()) {
                editor.setVisible(true);
                loginFirstLine.setVisible(false);
                logoutFirstLine.setVisible(true);
            }
            else {
                editor.setVisible(false);
                loginFirstLine.setVisible(true);
                logoutFirstLine.setVisible(false);

            }
        });
        if (Authentication.authenticated()) {
            loginFirstLine.flipTile(Authentication.getAuthenticatedUser());
            logoutFirstLine.flipTile(Authentication.getAuthenticatedUser());
        }
        // third line actions ==========================================================================================
        actionsThirdLine.add(new DockerhubTile());
        actionsThirdLine.add(new GithubTile());
        actionsThirdLine.add(new InsightLanguageTile());
        // fourth line actions =========================================================================================
        actionsFourthLine.add(new MailtoTile());
        if (conf.getDevMode()) {
            actionsFourthLine.add(new DevModeLocalLoginTile(conf.getLoginUrl()));
        }
        // get things done finally =====================================================================================
        var right = new VerticalLayout();
        right.setMargin(false);
        right.add(actionsFirstLine);
       // right.add(actionsSecondLine);
        right.add(actionsThirdLine);
        right.add(actionsFourthLine);
        content.add(bg);
        content.add(contentSplit(600, lb, right));
        return content;
    }

    private HorizontalLayout contentSplit(float leftWidth, Component left, Component right) {
        var dl = new Div();
        dl.setWidth(leftWidth, Unit.PIXELS);
        dl.add(left);
        var dr = new Div();
        dr.setWidth(grossContentWidth - leftWidth, Unit.PIXELS);
        dr.add(right);
        var res = new HorizontalLayout();
        res.add(dl);
        res.add(dr);
        return res;
    }

    private VerticalLayout createGreeting() {
        var layout = new VerticalLayout();
        layout.getStyle()
                .set("margin-top", "150px")
                .set("margin-left", marginLeft);
        layout.setSpacing(false);
        var greeting = new Div("Archinsight");
        greeting.getElement().getStyle()
                .set("font-size", "58px");
        layout.add(greeting);
        var tagline = new Div("Simplicity in Code, Power in Design");
        tagline.getElement().getStyle()
                .set("font-size", "32px");
        layout.add(tagline);
        return layout;
    }

    @ClientCallable
    public void loginCallback() {
        // called from browser when login sequence finishes
        if (Authentication.completedLogin()) {
            Authentication.authenticate();
            if (Authentication.authenticated()) {
                Communication.getBus().post(new UserAuthenticatedEvent(Authentication.getAuthenticatedUser()));
            }
        }
    }
}
