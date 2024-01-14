package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.components.MenuBarComponent;
import com.github.lonelylockley.archinsight.components.UserMenuComponent;
import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.html.*;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.dom.Element;
import com.vaadin.flow.theme.lumo.Lumo;

@CssImport("./styles/shared-styles.css")
@CssImport(value = "./styles/vaadin-text-field-styles.css", themeFor = "vaadin-text-field")
@CssImport(value = "./styles/vaadin-app-layout.css", themeFor = "vaadin-app-layout")
public interface BaseView {

    default Component createTitle(String titleSuffix, MenuBarComponent menu) {
        var title = new HorizontalLayout();
        title.getStyle().set("font-size", "var(--lumo-font-size-l)");
        title.getElement().setAttribute("theme", "");
        var siteIcon = new Image("static/archinsight-logo-no-background.svg", "ai");
        siteIcon.setHeight("24px");
        siteIcon.getStyle().set("margin-top", "7px").set("cursor", "pointer");
        siteIcon.addClickListener(event -> UI.getCurrent().navigate(SiteView.class));
        title.add(siteIcon);
        var siteName = new Span("Archinsight");
        siteName.getElement().addEventListener("click", event -> UI.getCurrent().navigate(SiteView.class));
        siteName.getStyle().set("margin-left", "7px").set("margin-top", "7px").set("cursor", "pointer");
        title.add(siteName);
        if (titleSuffix != null) {
            var suffixLabel = new Span(titleSuffix);
            title.add(suffixLabel);
            suffixLabel.getStyle().set("margin-left", "7px").set("margin-top", "7px");
        }
        title.add(menu);
        title.setVerticalComponentAlignment(FlexComponent.Alignment.CENTER);
        title.setWidthFull();
        return title;
    }

    default void addFooter(VerticalLayout parent) {
        // Actual footer content
        var layout = new HorizontalLayout();
        var footer = new Div();
        footer.add(new Span("Copyright © 2022-2024 Alexey Zaytsev"));
        footer.getElement().getStyle().set("font-size", "12px");
        footer.getElement().getStyle().set("margin-left", "auto");
        footer.getElement().getStyle().set("margin-right", "0");
        // Align the footer to the end of the wrapper
        layout.setAlignItems(FlexComponent.Alignment.END);
        layout.setWidthFull();
        layout.add(footer);
        // Make the footer always last in the parent using FlexBox order
        layout.getElement().getStyle().set("order", "999");
        parent.add(layout);
        // expand the wrapper to take all remaining unused space
        parent.expand(layout);
    }

    default void applyDarkTheme(Element el) {
        el.executeJs("document.documentElement.setAttribute('theme', $0)", Lumo.DARK);
    }

}
