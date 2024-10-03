package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.dialogs.DirectorySelectionDialog;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.vaadin.flow.component.*;
import com.vaadin.flow.component.contextmenu.MenuItem;
import com.vaadin.flow.component.contextmenu.SubMenu;
import com.vaadin.flow.component.html.Anchor;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.Icon;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.server.StreamResource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

public class MenuBarComponent extends MenuBar {

    private static final Logger logger = LoggerFactory.getLogger(MenuBarComponent.class);

    private final Div invisible;
    private final RemoteSource remoteSource;
    private final SwitchListenerHelper switchListener;
    private final MenuItem newButton;
    private final MenuItem sourceDropdown;
    private final MenuItem exportDropdown;
    private final MenuItem codePanel;
    private final MenuItem diagramPanel;
    private final MenuItem bothPanels;
    private final MenuItem zoomInButton;
    private final MenuItem zoomResetButton;
    private final MenuItem zoomOutButton;
    private final MenuItem zoomFitButton;
    private final MenuItem render;
    private final boolean readOnly;

    public MenuBarComponent(Div invisible, boolean readOnly, SwitchListenerHelper switchListener) {
        this.readOnly = readOnly;
        this.switchListener = switchListener;
        this.invisible = invisible;
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        ComponentEventListener<ClickEvent<MenuItem>> listener = this::menuItemClicked;

        newButton = createItem(this, "menu_btn_file_new", new Icon(VaadinIcon.FILE), "New file", null, false, false, listener);
        sourceDropdown = createItem(this, "menu_btn_source", null, "Source", new Icon(VaadinIcon.ANGLE_DOWN), false, false, listener);
        var sourceSubMenu = sourceDropdown.getSubMenu();
            createItem(sourceSubMenu, "menu_btn_file_save", new Icon(VaadinIcon.CLOUD_DOWNLOAD), "Save", null, true, !readOnly, listener);
            createItem(sourceSubMenu, "menu_btn_file_download", new Icon(VaadinIcon.DOWNLOAD), "Download", null, true, true, listener);
        exportDropdown = createItem(this, "menu_btn_export", null, "Diagram", new Icon(VaadinIcon.ANGLE_DOWN), false, false, listener);
        var exportSubMenu = exportDropdown.getSubMenu();
            createItem(exportSubMenu, "menu_btn_export_as_svg",  new Icon(VaadinIcon.DOWNLOAD), "Export as SVG", null, true, true, listener);
            createItem(exportSubMenu, "menu_btn_export_as_png",  new Icon(VaadinIcon.DOWNLOAD), "Export as PNG", null, true, true, listener);
            createItem(exportSubMenu, "menu_btn_export_as_json", new Icon(VaadinIcon.DOWNLOAD), "Export as JSON", null, true, true, listener);
            createItem(exportSubMenu, "menu_btn_export_as_dot",  new Icon(VaadinIcon.DOWNLOAD), "Export as DOT", null, true, true, listener);
        codePanel       = createItem(this, "menu_btn_panel_code", new Icon(VaadinIcon.PADDING_LEFT), null, null, false, true, listener);
        diagramPanel    = createItem(this, "menu_btn_panel_diagram", new Icon(VaadinIcon.PADDING_RIGHT), null, null, false, true, listener);
        bothPanels      = createItem(this, "menu_btn_panel_both", new Icon(VaadinIcon.SPLIT_H), null, null, false, true, listener);
        zoomInButton    = createItem(this, "menu_btn_zoom_plus", new Icon(VaadinIcon.PLUS), null, null, false, false, listener);
        zoomResetButton = createItem(this, "menu_btn_zoom_reset", new Icon(VaadinIcon.PLUS_MINUS), null, null, false, false, listener);
        zoomOutButton   = createItem(this, "menu_btn_zoom_minus", new Icon(VaadinIcon.MINUS), null, null, false, false, listener);
        zoomFitButton   = createItem(this, "menu_btn_zoom_fit", new Icon(VaadinIcon.EXPAND_SQUARE), null, null, false, false, listener);
        render          = createItem(this, "menu_btn_render", new Icon(VaadinIcon.CARET_RIGHT), "Render", null, false, false, listener);

        UI.getCurrent().addShortcutListener(this::saveButtonClicked, Key.KEY_S, KeyModifier.CONTROL);
        UI.getCurrent().addShortcutListener(this::saveButtonClicked, Key.KEY_S, KeyModifier.META);
    }

    private MenuItem createItem(MenuBar root, String id, Icon prefix, String text, Icon suffix, boolean padText, boolean enabled, ComponentEventListener<ClickEvent<MenuItem>> listener) {
        MenuItem item;
        if (prefix != null) {
            item = root.addItem(prefix, listener);
        }
        else {
            item = root.addItem(text, listener);
        }
        return createItemInternal(item, id, prefix, text, suffix, padText, enabled);
    }

    private MenuItem createItem(SubMenu root, String id, Icon prefix, String text, Icon suffix, boolean padText, boolean enabled, ComponentEventListener<ClickEvent<MenuItem>> listener) {
        MenuItem item;
        if (prefix != null) {
            item = root.addItem(prefix, listener);
        }
        else {
            assert text != null;
            item = root.addItem(text, listener);
        }
        return createItemInternal(item, id, prefix, text, suffix, padText, enabled);
    }

    private MenuItem createItemInternal(MenuItem newItem, String id, Icon prefix, String text, Icon suffix, boolean padText, boolean enabled) {
        if (prefix == null) {
            if (suffix != null) {
                if (padText) {
                    suffix.getStyle().set("padding-left", "5px");
                }
                newItem.add(suffix);
            }
        }
        else
        if (text != null) {
            var label = new Span(text);
            if (padText) {
                label.getStyle().set("padding-left", "5px");
            }
            newItem.add(label);
        }
        newItem.setId(id);
        newItem.setEnabled(enabled);
        return newItem;
    }

    public void enableNewFile() {
        newButton.setEnabled(true);
    }

    public void disableNewFile() {
        newButton.setEnabled(false);
    }

    public void enableSourceBlock() {
        sourceDropdown.setEnabled(true);
        render.setEnabled(true);
    }

    public void disableSourceBlock() {
        sourceDropdown.setEnabled(false);
        render.setEnabled(false);
    }

    public void enableExportBlock() {
        exportDropdown.setEnabled(true);
    }

    public void disableExportBlock() {
        exportDropdown.setEnabled(false);
    }

    public void enableDiagramBlock() {
        zoomInButton.setEnabled(true);
        zoomResetButton.setEnabled(true);
        zoomOutButton.setEnabled(true);
        zoomFitButton.setEnabled(true);
    }

    public void disableDiagramBlock() {
        zoomInButton.setEnabled(false);
        zoomResetButton.setEnabled(false);
        zoomOutButton.setEnabled(false);
        zoomFitButton.setEnabled(false);
    }

    private void menuItemClicked(ClickEvent<MenuItem> event) {
        var id = event.getSource().getId().orElse("");
        if (id.startsWith("menu_btn_export_as")) {
            exportButtonClicked(id);
        }
        else
        if (id.startsWith("menu_btn_file")) {
            fileButtonClicked(id);
        }
        else
        if (id.startsWith("menu_btn_zoom")) {
            zoomButtonClicked(id);
        }
        else
        if (id.equals("menu_btn_render")) {
            refreshButtonClicked();
        }
    }

    private void exportButtonClicked(String id) {
        Communication.getBus().post(new DoWithSourceEvent((callerTab, source, tabs) -> {
            var filename = callerTab.getFile().isNew() ? "export" : callerTab.getFile().getName().substring(0, callerTab.getFile().getName().length() - 3);
            StreamResource res;
            switch (id) {
                case "menu_btn_export_as_png":
                    final var png = new ByteArrayInputStream(remoteSource.export.exportPng(callerTab.getTabId(), switchListener.getActiveRepositoryId(), tabs));
                    res = new StreamResource("export.png", () -> png);
                    break;
                case "menu_btn_export_as_json":
                    final var json =new ByteArrayInputStream(remoteSource.export.exportJson(callerTab.getTabId(), switchListener.getActiveRepositoryId(), tabs));
                    res = new StreamResource(filename + ".json", () -> json);
                    break;
                case "menu_btn_export_as_svg":
                    final var svg = new ByteArrayInputStream(remoteSource.export.exportSvg(callerTab.getTabId(), switchListener.getActiveRepositoryId(), tabs));
                    res = new StreamResource(filename + ".svg", () -> svg);
                    break;
                default:
                    final var dot = new ByteArrayInputStream(remoteSource.export.exportDot(callerTab.getTabId(), switchListener.getActiveRepositoryId(), tabs));
                    res = new StreamResource(filename + ".dot", () -> dot);
                    break;
            }
            startDownload(res);
        }));
    }

    private void fileButtonClicked(String id) {
        switch (id) {
            case "menu_btn_file_new":
                newButtonClicked();
                break;
            case "menu_btn_file_save":
                saveButtonClicked();
                break;
            case "menu_btn_file_download":
                downloadButtonClicked();
                break;
        }
    }

    private void newButtonClicked() {
        var node = new RepositoryNode();
        node.setType(RepositoryNode.TYPE_FILE);
        node.setName("<New File>");
        Communication.getBus().post(new FileOpenRequestEvent(node));
    }

    private void saveSource(RepositoryNode file) {
        Communication.getBus().post(new FileSaveRequestEvent(file, FileChangeReason.USER_REQUEST));
    }

    private void saveButtonClicked() {
        if (readOnly) {
            return;
        }
        Communication.getBus().post(new DoWithSourceEvent((tab, source, tabs) -> {
            if (tab.getFile().isNew()) {
                var dlg = new DirectorySelectionDialog("Save new file", "File name", "Choose directory", "Archinsight will add an .ai extension automatically", switchListener.getActiveRepositoryId(), res -> {
                    Communication.getBus().post(res);
                    saveSource(res.getCreatedFile());
                });
                dlg.open();
            }
            else {
                saveSource(tab.getFile());
            }
        }));
    }

    private void refreshButtonClicked() {
        Communication.getBus().post(new RequestRenderEvent(switchListener.getActiveRepositoryId()));
    }

    private void downloadButtonClicked() {
        Communication.getBus().post(new DoWithSourceEvent((callerTab, code, tabs) -> {
            final var filename = callerTab.getFile().isNew() ? "source.ai" : callerTab.getFile().getName();
            var res = new StreamResource(filename, () -> new ByteArrayInputStream(code.getBytes(StandardCharsets.UTF_8)));
            startDownload(res);
        }));
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

    private void zoomButtonClicked(String id) {
        switch (id) {
            case "menu_btn_zoom_plus":
                Communication.getBus().post(new ZoomEvent().zoomIn());
                break;
            case "menu_btn_zoom_minus":
                Communication.getBus().post(new ZoomEvent().zoomOut());
                break;
            case "menu_btn_zoom_fit":
                Communication.getBus().post(new ZoomEvent().fit());
                break;
            default:
                Communication.getBus().post(new ZoomEvent().reset());
                break;
        }
    }

}
