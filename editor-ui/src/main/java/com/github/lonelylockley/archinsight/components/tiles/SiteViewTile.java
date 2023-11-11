package com.github.lonelylockley.archinsight.components.tiles;

import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.html.Image;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.icon.Icon;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public abstract class SiteViewTile extends VerticalLayout {

    public static final float singleWidth = 150;
    public static final float doubleWidth = 310;

    public static final float singleHeight = 150;

    private final Image icon;
    private final Label txt;

    public SiteViewTile(String text, String iconSrc, String color, float width, float height) {
        setMargin(false);
        setPadding(false);
        setAlignItems(Alignment.CENTER);
        setWidth(width, Unit.PIXELS);
        setHeight(height, Unit.PIXELS);
        getElement().getStyle().set("padding-top", (height * 0.12) + "px");
        icon = new Image(iconSrc, "-");
        var smaller = Math.min(width, height);
        icon.setWidth(smaller * 0.5f, Unit.PIXELS);
        icon.setHeight(smaller * 0.5f, Unit.PIXELS);
        add(icon);
        txt = new Label(text);
        add(txt);
        setColor(color);
    }

    protected void makeTextBold() {
        txt.getStyle().set("font-weight", "bold");
    }

    protected void makeTextNormal() {
        txt.getStyle().remove("font-weight");
    }

    protected void setText(String text) {
        txt.setText(text);
    }

    protected void setIcon(String imageSrc) {
        icon.setSrc(imageSrc);
    }

    public void setColor(String color) {
        getElement().getStyle().set("background-color", color);
    }
}
