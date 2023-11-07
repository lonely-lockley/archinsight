package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
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

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

public class MenuBarComponent extends MenuBar {

    private static final Logger logger = LoggerFactory.getLogger(MenuBarComponent.class);

    private final Div invisible;
    private final RemoteSource remoteSource;

    private RepositoryNode fileOpened;

    public MenuBarComponent(Div invisible, boolean readOnly) {
        this.invisible = invisible;
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        ComponentEventListener<ClickEvent<MenuItem>> listener = this::menuItemClicked;

        final var saveButton = addItem("Save source", listener);
        saveButton.setId("menu_btn_file_save");
        saveButton.add(new Icon(VaadinIcon.CLOUD_DOWNLOAD));
        saveButton.setEnabled(false);
        var item = addItem("Download source", listener);
        item.setId("menu_btn_file_download");
        item.add(new Icon(VaadinIcon.DOWNLOAD));
        final var exportDropdown = addItem("Export Image", listener);
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
        final var zoomInButton = addItem("", listener);
        zoomInButton.setId("menu_btn_zoom_plus");
        zoomInButton.add(new Icon(VaadinIcon.PLUS));
        zoomInButton.setEnabled(false);
        final var zoomResetButton = addItem("", listener);
        zoomResetButton.add(new Icon(VaadinIcon.PLUS_MINUS));
        zoomResetButton.setId("menu_btn_zoom_reset");
        zoomResetButton.setEnabled(false);
        final var zoomOutButton = addItem("", listener);
        zoomOutButton.setId("menu_btn_zoom_minus");
        zoomOutButton.add(new Icon(VaadinIcon.MINUS));
        zoomOutButton.setEnabled(false);
        final var zoomFitButton = addItem("", listener);
        zoomFitButton.setId("menu_btn_zoom_fit");
        zoomFitButton.add(new Icon(VaadinIcon.EXPAND_SQUARE));
        zoomFitButton.setEnabled(false);

        final var sourceCompilationListener = new BaseListener<SourceCompilationEvent>() {
            @Override
            @Subscribe
            public void receive(SourceCompilationEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (exportDropdown.isEnabled() && e.failure()) {
                        exportDropdown.setEnabled(false);
                        zoomInButton.setEnabled(false);
                        zoomResetButton.setEnabled(false);
                        zoomOutButton.setEnabled(false);
                        zoomFitButton.setEnabled(false);
                    }
                    else
                    if (!exportDropdown.isEnabled() && e.success()) {
                        exportDropdown.setEnabled(true);
                    }
                }
            }
        };
        Communication.getBus().register(sourceCompilationListener);
        addDetachListener(e -> Communication.getBus().unregister(sourceCompilationListener));

        final var fileSelectionListener = new BaseListener<FileOpenRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileOpenRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (!readOnly) {
                        saveButton.setEnabled(true);
                    }
                    openButtonClicked(e.getFile());
                }
            }
        };
        Communication.getBus().register(fileSelectionListener);
        addDetachListener(e -> Communication.getBus().unregister(fileSelectionListener));

        final var repositoryCloseListener = new BaseListener<RepositoryCloseEvent>() {
            @Override
            @Subscribe
            public void receive(RepositoryCloseEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    MenuBarComponent.this.fileOpened = null;
                    saveButton.setEnabled(false);
                    exportDropdown.setEnabled(false);
                    zoomInButton.setEnabled(false);
                    zoomResetButton.setEnabled(false);
                    zoomOutButton.setEnabled(false);
                    zoomFitButton.setEnabled(false);
                }
            }
        };
        Communication.getBus().register(repositoryCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositoryCloseListener); });

        final var fileRestorationListener = new BaseListener<FileRestoredEvent>() {
            @Override
            @Subscribe
            public void receive(FileRestoredEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    MenuBarComponent.this.fileOpened = e.getOpenedFile();
                    saveButton.setEnabled(true);
                }
            }
        };
        Communication.getBus().register(fileRestorationListener);
        addDetachListener(e -> { Communication.getBus().unregister(fileRestorationListener); });

        final var fileCloseListener = new BaseListener<FileCloseRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileCloseRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    saveButton.setEnabled(false);
                    exportDropdown.setEnabled(false);
                    zoomInButton.setEnabled(false);
                    zoomResetButton.setEnabled(false);
                    zoomOutButton.setEnabled(false);
                    zoomFitButton.setEnabled(false);
                }
            }
        };
        Communication.getBus().register(fileCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(fileCloseListener); });

        final var svgDataListener = new BaseListener<SvgDataEvent>() {
            @Override
            @Subscribe
            public void receive(SvgDataEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    zoomInButton.setEnabled(true);
                    zoomResetButton.setEnabled(true);
                    zoomOutButton.setEnabled(true);
                    zoomFitButton.setEnabled(true);
                }
            }
        };
        Communication.getBus().register(svgDataListener);
        addDetachListener(e -> { Communication.getBus().unregister(svgDataListener); });
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
            this.fileOpened = fileSelected;
            Communication.getBus().post(new FileOpenedEvent(fileOpened));
    }

    private void saveButtonClicked() {
        if (fileOpened != null) {
            this.getElement().executeJs("return window.editor.getValue()").then(String.class, code -> {
                remoteSource.repository.saveFile(fileOpened.getId(), code);
            });
        }
    }

    private void downloadButtonClicked() {
        final var filename = fileOpened == null ? "source.ai" : fileOpened.getName();
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
