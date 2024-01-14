package com.github.lonelylockley.archinsight.components.tiles;

import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.html.Image;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import org.apache.commons.lang3.text.WordUtils;

public abstract class SiteViewTile extends VerticalLayout {

    public static final float singleWidth = 150;
    public static final float doubleWidth = 310;
    public static final float tripleWidth = 470;

    public static final float singleHeight = 150;

    private final Image icon;
    private final Span txt;

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
        txt = new Span(text);
        txt.getStyle().set("font-size", "var(--lumo-font-size-l)");
        add(txt);
        setColor(color);
    }

    protected String limitTextLength(String text, int limit) {
        assert limit > 3;
        if (text.length() <= limit) {
            return text;
        }
        else {
            return text.substring(0, limit - 3) + "...";
        }
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
