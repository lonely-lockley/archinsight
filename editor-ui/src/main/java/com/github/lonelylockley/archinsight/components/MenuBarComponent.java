package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.ClickEvent;
import com.vaadin.flow.component.ComponentEventListener;
import com.vaadin.flow.component.Text;
import com.vaadin.flow.component.contextmenu.MenuItem;
import com.vaadin.flow.component.menubar.MenuBar;

public class MenuBarComponent extends MenuBar {

    public MenuBarComponent() {
        ComponentEventListener<ClickEvent<MenuItem>> listener = e -> System.out.println(e.getSource().getId());

        var item = addItem("Save Source", listener);
        item.setId("menu_btn_save");
        item = addItem("Export", listener);
        item.setId("menu_btn_export");
            var exportSubMenu = item.getSubMenu();
            exportSubMenu.addItem("as SVG",listener);
            exportSubMenu.addItem("as PNG", listener);
            exportSubMenu.addItem("as JSON", listener);
        item = addItem("[ + ", listener);
        item.setId("menu_btn_plus");
        item = addItem(" 0 ", listener);
        item.setId("menu_btn_reset");
        item = addItem(" - ]", listener);
        item.setId("menu_btn_minus");
    }

}
