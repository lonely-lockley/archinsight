package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.tiles.*;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.UserAuthenticated;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Label;
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

    private static final int grossContentWidth = 1000;
    private static final String marginLeft = "100px";

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
        lb.getElement().getStyle().set("text-align", "justify");
        try {
            lb.getElement().setProperty("innerHTML", IOUtils.toString(this.getClass().getResourceAsStream("/description.html"), StandardCharsets.UTF_8));
        }
        catch (Exception ex) {
            logger.error("Could not load site description", ex);
        }
        // first line actions ==========================================================================================
        var actionsFirstLine = new HorizontalLayout();
        actionsFirstLine.setMargin(false);
        actionsFirstLine.add(new DockerhubTile());
        actionsFirstLine.add(new GithubTile());
        actionsFirstLine.add(new PlaygroundTile());
        // second line actions =========================================================================================
        var actionsSecondLine = new HorizontalLayout();
        actionsSecondLine.setMargin(false);
        var login = new LoginTile(conf.getLoginUrl());
        if (Authentication.authenticated()) {
            login.flipTile(Authentication.getAuthenticatedUser());
        }
        actionsSecondLine.add(login);
        actionsSecondLine.add(new InsightLanguageTile());
        // third line actions ==========================================================================================
        var actionsThirdLine = new HorizontalLayout();
        actionsThirdLine.setMargin(false);
        actionsThirdLine.add(new MaitoTile());
        // third line actions ==========================================================================================
        var actionsFourthLine = new HorizontalLayout();
        if (conf.getDevMode()) {
            actionsFourthLine.add(new DevModeLocalLoginTile(conf.getLoginUrl()));
        }
        // get things done finally =====================================================================================
        var right = new VerticalLayout();
        right.setMargin(false);
        right.add(actionsFirstLine);
        right.add(actionsSecondLine);
        right.add(actionsThirdLine);
        right.add(actionsFourthLine);
        content.add(bg);
        content.add(contentSplit(783, lb, right));
        return content;
    }

    private HorizontalLayout contentSplit(float leftWidth, Component left, Component right) {
        var dl = new Div();
        dl.setWidth(leftWidth, Unit.PIXELS);
        dl.add(left);
        var dr = new Div();
        dr.setWidth(100, Unit.PERCENTAGE);
        dr.add(right);
        var res = new HorizontalLayout();
        res.add(dl);
        res.add(dr);
        return res;
    }

    private FlexLayout createGreeting() {
        var layout = new FlexLayout();
        layout.setAlignItems(Alignment.END);
        var greeting = new Div();
        greeting.add(new Label("Archinsight"));
        greeting.getElement().getStyle().set("font-size", "58px");
        greeting.getElement().getStyle().set("margin-top", "150px");
        greeting.getElement().getStyle().set("margin-left", marginLeft);
        layout.add(greeting);
        return layout;
    }

    @ClientCallable
    public void loginCallback() {
        // called from browser when login sequence finishes
        if (Authentication.completedLogin()) {
            Authentication.authenticate();
            if (Authentication.authenticated()) {
                Communication.getBus().post(new UserAuthenticated(Authentication.getAuthenticatedUser()));
            }
        }
    }
}
