package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.remote.ExportSource;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClickEvent;
import com.vaadin.flow.component.ComponentEventListener;
import com.vaadin.flow.component.contextmenu.MenuItem;
import com.vaadin.flow.component.html.Anchor;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Hr;
import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.server.StreamResource;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

public class MenuBarComponent extends MenuBar {

    private final Div invisible;

    private MenuItem exportDropdown;

    public MenuBarComponent(Div invisible) {
        this.invisible = invisible;
        ComponentEventListener<ClickEvent<MenuItem>> listener = this::menuItemClicked;

        var item = addItem("Save Source", listener);
        item.setId("menu_btn_save");
        exportDropdown = addItem("Export Image", listener);
        exportDropdown.setId("menu_btn_export");
        exportDropdown.setEnabled(false);
            var exportSubMenu = exportDropdown.getSubMenu();
            item = exportSubMenu.addItem("as SVG", listener);
            item.setId("menu_btn_export_as_svg");
            item = exportSubMenu.addItem("as PNG", listener);
            item.setId("menu_btn_export_as_png");
            item = exportSubMenu.addItem("as JSON", listener);
            item.setId("menu_btn_export_as_json");
            item = exportSubMenu.addItem("as DOT", listener);
            item.setId("menu_btn_export_as_dot");
        item = addItem(" + ", listener);
        item.setId("menu_btn_plus");
        item = addItem(" 1:1 ", listener);
        item.setId("menu_btn_reset");
        item = addItem(" - ", listener);
        item.setId("menu_btn_minus");

        Communication.getBus().register(new Object() {
            @Subscribe
            public void sourceCompiled(SourceCompilationEvent e) {
                if (exportDropdown.isEnabled() && e.failure()) {
                    exportDropdown.setEnabled(false);
                }
                else
                if (!exportDropdown.isEnabled() && e.success()) {
                    exportDropdown.setEnabled(true);
                }
            }
        });
    }

    private void menuItemClicked(ClickEvent<MenuItem> event) {
        var id = event.getSource().getId().orElse("");
        if (id.startsWith("menu_btn_export_as")) {
            exportButtonClicked(id);
        }
        else
        if (id.startsWith("menu_btn_save")) {
            saveButtonClicked(id);
        }
    }

    private void exportButtonClicked(String id) {
        this.getElement().executeJs("return window.editor.getValue()").then(String.class, code -> {
            StreamResource res;
            switch (id) {
                case "menu_btn_export_as_png":
                    res = new StreamResource("test.png", () -> new ByteArrayInputStream(new ExportSource().exportPng(code)));
                    break;
                case "menu_btn_export_as_json":
                    res = new StreamResource("test.json", () -> new ByteArrayInputStream(new ExportSource().exportJson(code)));
                    break;
                case "menu_btn_export_as_svg":
                    res = new StreamResource("test.svg", () -> new ByteArrayInputStream(new ExportSource().exportSvg(code)));
                    break;
                default:
                    res = new StreamResource("test.dot", () -> new ByteArrayInputStream(new ExportSource().exportDot(code)));
                    break;
            }
            startDownload(res);
        });
    }

    private void saveButtonClicked(String id) {
        this.getElement().executeJs("return window.editor.getValue()").then(String.class, code -> {
            var res = new StreamResource("test.ai", () -> new ByteArrayInputStream(code.getBytes(StandardCharsets.UTF_8)));
            startDownload(res);
        });
    }

    private void startDownload(StreamResource res) {
        var a = new Anchor();
        a.setHref(res);
        a.getElement().setAttribute("router-ignore", true);
        a.getElement().setAttribute("download", true);
        a.getElement().getStyle().set("display", "none");
        invisible.add(a);
        a.getElement().executeJs(
                "return new Promise(resolve =>{this.click(); setTimeout(() => resolve(true), 150)})",
                a.getElement()).then(jsonValue -> invisible.remove(a)
        );
    }

}
