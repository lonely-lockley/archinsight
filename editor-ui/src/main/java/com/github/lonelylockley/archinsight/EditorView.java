package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.components.*;
import com.vaadin.flow.component.applayout.AppLayout;
import com.vaadin.flow.component.applayout.DrawerToggle;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.router.Route;
import com.vaadin.flow.theme.lumo.Lumo;

/**
 * The main view contains a button and a click listener.
 */
@Route("")
@CssImport("./styles/shared-styles.css")
@CssImport(value = "./styles/vaadin-text-field-styles.css", themeFor = "vaadin-text-field")
public class EditorView extends AppLayout {

    public EditorView() {
        DrawerToggle toggle = new DrawerToggle();

        H1 title = new H1("Archinsight");
        title.getStyle().set("font-size", "var(--lumo-font-size-l)")
                .set("margin", "0");

        addToDrawer(new NavItemsComponent());
        addToNavbar(toggle, title);
        setDrawerOpened(false);

        var splitView = new SplitViewComponent(new EditorComponent(), new Div());
        var content = new WorkAreaComponent(new MenuBarComponent(), splitView);
        setContent(content);
        var js = "document.documentElement.setAttribute('theme', $0)";
        getElement().executeJs(js, Lumo.DARK);
    }

}