package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.components.*;
import com.vaadin.flow.component.applayout.AppLayout;
import com.vaadin.flow.component.applayout.DrawerToggle;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.theme.lumo.Lumo;

/**
 * The main view contains a button and a click listener.
 */
public abstract class BasicEditorView extends AppLayout implements BaseView {

    public BasicEditorView(String titleSuffix, boolean menuEnabled) {
        DrawerToggle toggle = new DrawerToggle();

        var title = createTitle(titleSuffix);

        var nav = new NavItemsComponent();
        // how to disable drawer button?
        addToDrawer(nav);
        addToNavbar(toggle, title);
        setDrawerOpened(false);

        /* =============================================================================================================
         * a hidden element to spawn download links
         * without it, download activation script triggering anchor click, triggers menu item click again causing
         * endless cycle
         */
        var invisible = new Div();
        invisible.getElement().getStyle().set("display", "none");
        addToDrawer(invisible);
        // =============================================================================================================
        var contentLayout = new VerticalLayout();
        var splitView = new SplitViewComponent(new EditorComponent(), new SVGViewComponent());
        var content = new WorkAreaComponent(new MenuBarComponent(invisible), splitView);
        contentLayout.add(content);
        contentLayout.setSizeFull();
        addFooter(contentLayout);
        setContent(contentLayout);
        applyDarkTheme(getElement());
    }

}