package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Image;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.orderedlayout.FlexLayout;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.*;

@Route("")
@PageTitle("Archinsight")
public class SiteView extends VerticalLayout implements BaseView, HasUrlParameter<String> {

    private static final int grossContentWidth = 1000;
    private static final int margin = 5;

    public SiteView() {
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
        content.setPadding(false);
        // project motivation ==========================================================================================
        var lb = new Div();
        lb.getElement().getStyle().set("text-align", "justify");
        lb.getElement().setProperty("innerHTML", """
                        Archinsight project tends to implement architecture-as-code definition of a standard c4 architecture model. 
                        This project offers a new Insight language designed in such way that an Architect can focus on architecture 
                        definition, not visualization.
                        <br>
                        Compared to UML, the Insight language is more specific and is unable to describe 
                        an arbitrary entity, but shorter and probably easier to use.
                        <br>
                        Unlike other UML software, such as PlantUML, Archinsight would offer it's user:
                        <ul>
                          <li>A specific Insight language to describe c4 model</li>
                          <li>Model integrity check with linker</li>
                          <li>Model interactivity</li>
                          <li>Architecture introspections from highest to lowest level in one place</li>
                        </ul>
                        """);
        // first line actions ==========================================================================================
        var actionsFirstLine = new HorizontalLayout();
        actionsFirstLine.setMargin(false);
        var dockerhub = createTile(150, "Dockerhub", "static/docker-svgrepo-com.svg", "#0db7ed");
        dockerhub.getElement().setAttribute("router-ignore", true);
        dockerhub.setClassName("tile_action");
        dockerhub.addClickListener(e -> {
            getElement().executeJs("window.open('https://hub.docker.com/r/lonelylockley/archinsight', '_blank')");
        });
        var github = createTile(150, "Project Github", "static/github-142-svgrepo-com.svg", "#171515");
        github.getElement().setAttribute("router-ignore", true);
        github.setClassName("tile_action");
        github.addClickListener(e -> {
            getElement().executeJs("window.open('https://github.com/lonely-lockley/archinsight', '_blank')");
        });
        var playground = createTile(150, "Playground", "static/playground-svgrepo-com.svg", "#04AA6D");
        playground.setClassName("tile_action");
        playground.addClickListener(e -> {
            UI.getCurrent().navigate("playground");
        });
        actionsFirstLine.add(dockerhub);
        actionsFirstLine.add(github);
        actionsFirstLine.add(playground);
        // second line actions =========================================================================================
        var actionsSecondLine = new HorizontalLayout();
        actionsSecondLine.setMargin(false);
        var login = createTile(317, 150, "Sign in with Google", "static/google-178-svgrepo-com.svg", "#ff4e50");
        login.getElement().setAttribute("router-ignore", true);
        login.setClassName("tile_action");
        login.addClickListener(e -> {
            getElement().executeJs(String.format("window.open('%s/oauth/login/google', '')", System.getenv("IDENTITY")));
        });
        var ilang = createTile(150, "Insight language", "static/language-json-svgrepo-com.svg", "#a7226e");
        ilang.getElement().setAttribute("router-ignore", true);
        ilang.setClassName("tile_action");
        ilang.addClickListener(e -> {
            getElement().executeJs("window.open('https://github.com/lonely-lockley/archinsight/wiki/Insight-language', '_blank')");
        });
        actionsSecondLine.add(login);
        actionsSecondLine.add(ilang);
        // third line actions ==========================================================================================
        var actionsThirdLine = new HorizontalLayout();
        actionsThirdLine.setMargin(false);
        var mailto = createTile(150, "Contact us", "static/mail-pencil-svgrepo-com.svg", "#f9d423");
        mailto.getElement().setAttribute("router-ignore", true);
        mailto.setClassName("tile_action");
        mailto.addClickListener(e -> {
            getElement().executeJs("window.open('mailto:webmaster@archinsight.org', '')");
        });
        actionsThirdLine.add(mailto);
        // get thing done finally ======================================================================================
        var right = new VerticalLayout();
        right.setMargin(false);
        right.add(actionsFirstLine);
        right.add(actionsSecondLine);
        right.add(actionsThirdLine);
        content.add(contentSplit(783, lb, right));
        return content;
    }

    private VerticalLayout createTile(float width, float height, String text, String iconSrc, String color) {
        var res = new VerticalLayout();
        res.setMargin(false);
        res.setPadding(false);
        res.setAlignItems(Alignment.CENTER);
        res.setWidth(width, Unit.PIXELS);
        res.setHeight(height, Unit.PIXELS);
        res.getElement().getStyle().set("padding-top", (height * 0.12) + "px");
        var icon = new Image(iconSrc, "-");
        var smaller = Math.min(width, height);
        icon.setWidth(smaller * 0.5f, Unit.PIXELS);
        icon.setHeight(smaller * 0.5f, Unit.PIXELS);
        res.add(icon);
        var txt = new Label(text);
        res.add(txt);
        res.getElement().getStyle().set("background-color", color);
        return res;
    }

    private VerticalLayout createTile(float size, String text, String iconSrc, String color) {
        return createTile(size, size, text, iconSrc, color);
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
        greeting.getElement().getStyle().set("margin-top", "100px");
        layout.add(greeting);
        return layout;
    }

    @Override
    public void setParameter(BeforeEvent event, @OptionalParameter String parameter) {
        var location = event.getLocation();
        UI.getCurrent().navigate(parameter);
    }
}
