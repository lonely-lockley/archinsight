package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.dom.Element;
import com.vaadin.flow.theme.lumo.Lumo;

@CssImport("./styles/shared-styles.css")
@CssImport(value = "./styles/vaadin-text-field-styles.css", themeFor = "vaadin-text-field")
@CssImport(value = "./styles/vaadin-app-layout.css", themeFor = "vaadin-app-layout")
public interface BaseView {

    default Component createTitle() {
        return createTitle(null);
    }

    default Component createTitle(String titleSuffix) {
        H1 title = new H1("Archinsight" + (titleSuffix == null ? "" : titleSuffix));
        title
                .getStyle()
                .set("font-size", "var(--lumo-font-size-l)")
                .set("margin", "0");
        return title;
    }

    default void addFooter(VerticalLayout parent) {
        // Actual footer content
        var layout = new HorizontalLayout();
        var footer = new Div();
        footer.add(new Label("Copyright © 2023 lonely-lockley"));
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
