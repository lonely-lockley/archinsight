package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.dialogs.DirectorySelectionDialog;
import com.github.lonelylockley.archinsight.components.dialogs.ResultReturningDialog;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClickEvent;
import com.vaadin.flow.component.ComponentEventListener;
import com.vaadin.flow.component.contextmenu.MenuItem;
import com.vaadin.flow.component.html.Anchor;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.icon.Icon;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.server.StreamResource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class MenuBarComponent extends MenuBar {

    private static final Logger logger = LoggerFactory.getLogger(MenuBarComponent.class);

    private final Div invisible;
    private final RemoteSource remoteSource;
    private final SwitchListenerHelper switchListener;

    private final MenuItem saveButton;
    private final MenuItem exportDropdown;
    private final MenuItem zoomInButton;
    private final MenuItem zoomResetButton;
    private final MenuItem zoomOutButton;
    private final MenuItem zoomFitButton;
    private final boolean readOnly;

    public MenuBarComponent(Div invisible, boolean readOnly, SwitchListenerHelper switchListener) {
        this.readOnly = readOnly;
        this.switchListener = switchListener;
        this.invisible = invisible;
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        ComponentEventListener<ClickEvent<MenuItem>> listener = this::menuItemClicked;

        saveButton = addItem("Save source", listener);
        saveButton.setId("menu_btn_file_save");
        saveButton.add(new Icon(VaadinIcon.CLOUD_DOWNLOAD));
        saveButton.setEnabled(false);
        var item = addItem("Download source", listener);
        item.setId("menu_btn_file_download");
        item.add(new Icon(VaadinIcon.DOWNLOAD));
        exportDropdown = addItem("Export Image", listener);
        exportDropdown.setId("menu_btn_export");
        exportDropdown.add(new Icon(VaadinIcon.ANGLE_DOWN));
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
        zoomInButton = addItem("", listener);
        zoomInButton.setId("menu_btn_zoom_plus");
        zoomInButton.add(new Icon(VaadinIcon.PLUS));
        zoomInButton.setEnabled(false);
        zoomResetButton = addItem("", listener);
        zoomResetButton.add(new Icon(VaadinIcon.PLUS_MINUS));
        zoomResetButton.setId("menu_btn_zoom_reset");
        zoomResetButton.setEnabled(false);
        zoomOutButton = addItem("", listener);
        zoomOutButton.setId("menu_btn_zoom_minus");
        zoomOutButton.add(new Icon(VaadinIcon.MINUS));
        zoomOutButton.setEnabled(false);
        zoomFitButton = addItem("", listener);
        zoomFitButton.setId("menu_btn_zoom_fit");
        zoomFitButton.add(new Icon(VaadinIcon.EXPAND_SQUARE));
        zoomFitButton.setEnabled(false);

        final var sourceCompilationListener = new BaseListener<SourceCompilationEvent>() {
            @Override
            @Subscribe
            public void receive(SourceCompilationEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (exportDropdown.isEnabled() && e.failure()) {
                        disableExportButton();
                        disableControlButtons();
                    }
                    else
                    if (!exportDropdown.isEnabled() && e.success()) {
                        enableExportButton();
                    }
                }
            }
        };
        Communication.getBus().register(sourceCompilationListener);
        addDetachListener(e -> Communication.getBus().unregister(sourceCompilationListener));

        final var svgDataListener = new BaseListener<SvgDataEvent>() {
            @Override
            @Subscribe
            public void receive(SvgDataEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    enableControlButtons();
                }
            }
        };
        Communication.getBus().register(svgDataListener);
        addDetachListener(e -> { Communication.getBus().unregister(svgDataListener); });
    }

    public void openFile(RepositoryNode file) {
        openButtonClicked(file);
    }

    public void enableSaveButton() {
        if (!readOnly) {
            saveButton.setEnabled(true);
        }
    }

    public void disableSaveButton() {
        saveButton.setEnabled(false);
    }

    public void enableExportButton() {
        exportDropdown.setEnabled(true);
    }

    public void disableExportButton() {
        exportDropdown.setEnabled(false);
    }

    public void enableControlButtons() {
        zoomInButton.setEnabled(true);
        zoomResetButton.setEnabled(true);
        zoomOutButton.setEnabled(true);
        zoomFitButton.setEnabled(true);
    }

    public void disableControlButtons() {
        zoomInButton.setEnabled(false);
        zoomResetButton.setEnabled(false);
        zoomOutButton.setEnabled(false);
        zoomFitButton.setEnabled(false);
    }

    public void enableButtons() {

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
    }

    private void exportButtonClicked(String id) {
        this.getElement().executeJs("return window.editor.getValue()").then(String.class, code -> {
            StreamResource res;
            switch (id) {
                case "menu_btn_export_as_png":
                    res = new StreamResource("export.png", () -> new ByteArrayInputStream(remoteSource.export.exportPng(code)));
                    break;
                case "menu_btn_export_as_json":
                    res = new StreamResource("export.json", () -> new ByteArrayInputStream(remoteSource.export.exportJson(code)));
                    break;
                case "menu_btn_export_as_svg":
                    res = new StreamResource("export.svg", () -> new ByteArrayInputStream(remoteSource.export.exportSvg(code)));
                    break;
                default:
                    res = new StreamResource("export.dot", () -> new ByteArrayInputStream(remoteSource.export.exportDot(code)));
                    break;
            }
            startDownload(res);
        });
    }

    private void fileButtonClicked(String id) {
        switch (id) {
            case "menu_btn_file_save":
                saveButtonClicked();
                break;
            case "menu_btn_file_download":
                downloadButtonClicked();
                break;
        }
    }

    private void openButtonClicked(RepositoryNode fileSelected) {
        var content = remoteSource.repository.openFile(fileSelected.getId());
        this.getElement().executeJs("window.editor.setValue($0)", content);
        Communication.getBus().post(new FileOpenedEvent(fileSelected));
    }

    private void saveSource(UUID fileId) {
        this.getElement().executeJs("return window.editor.getValue()").then(String.class, code -> {
            remoteSource.repository.saveFile(fileId, code);
            Communication.getBus().post(new NotificationEvent(MessageLevel.WARNING, "File saved", 3000));
        });
    }

    private void saveButtonClicked() {
        if (switchListener.fileOpened()) {
            saveSource(switchListener.getOpenedFileId());
        }
        else {
            var dlg = new DirectorySelectionDialog("Create new file", "File name", "Choose directory", "Archinsight will add an .ai extension automatically", switchListener.getActiveRepositoryId(), res -> {
                Communication.getBus().post(res);
                saveSource(res.getCreatedFile().getId());
            });
            dlg.open();
        }
    }

    private void downloadButtonClicked() {
        final var filename = switchListener.fileOpened() ? switchListener.getOpenedFile().getName() : "source.ai";
        this.getElement().executeJs("return window.editor.getValue()").then(String.class, code -> {
            var res = new StreamResource(filename, () -> new ByteArrayInputStream(code.getBytes(StandardCharsets.UTF_8)));
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
