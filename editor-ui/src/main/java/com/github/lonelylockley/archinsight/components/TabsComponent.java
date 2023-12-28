package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.tabs.TabSheet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class TabsComponent extends TabSheet {

    private static final Logger logger = LoggerFactory.getLogger(TabsComponent.class);
    private static final String id = "tabs-container";

    private final ConcurrentHashMap<String, EditorTabComponent> tabs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, EditorTabComponent> files = new ConcurrentHashMap<>();
    private final RemoteSource remoteSource;

    public TabsComponent() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setId(id);
        setSizeFull();
        addSelectedChangeListener(e -> {
            var tab = (EditorTabComponent) e.getSelectedTab();
            if (tab == null || tab.isNew()) {
                storeOpenedFile(null);
            }
            else {
                storeOpenedFile(tab.getFileId());
            }
            Communication.getBus().post(new TabSwitchEvent((EditorTabComponent) e.getPreviousTab(), (EditorTabComponent) e.getSelectedTab()));
        });

        final var svgDataListener = new BaseListener<SvgDataEvent>() {
            @Override
            @Subscribe
            public void receive(SvgDataEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                Optional.ofNullable(tabs.get(e.getTabId())).ifPresent(tab -> tab.getView().update(e.getSvgData()));
            }
            }
        };
        Communication.getBus().register(svgDataListener);
        final var zoomEventListener = new BaseListener<ZoomEvent>() {
            @Override
            @Subscribe
            public void receive(ZoomEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                Optional.ofNullable(getSelectedTab()).ifPresent(tab -> tab.getView().zoom(e));
            }
            }
        };
        Communication.getBus().register(zoomEventListener);
        final var saveEventListener = new BaseListener<FileSaveRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileSaveRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    Optional.ofNullable(getSelectedTab()).ifPresent(tab -> {
                        if (tab.isNew()) {
                            tab.updateFile(e.getFile());
                            files.put(e.getFile().getId(), tab);
                        }
                        tab.saveSource();
                    });
                }
            }
        };
        Communication.getBus().register(saveEventListener);
        final var sourceActionEventListener = new BaseListener<DoWithSourceEvent>() {
            @Override
            @Subscribe
            public void receive(DoWithSourceEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    Optional.ofNullable(getSelectedTab()).ifPresent(tab -> {
                        tab.getEditor().doWithCode(tab.getFile(), tab.getTabId(), e.getCallback());
                    });
                }
            }
        };
        Communication.getBus().register(sourceActionEventListener);
        final var fileChangeListener = new BaseListener<FileChangeEvent>() {
            @Override
            @Subscribe
            public void receive(FileChangeEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    Optional.ofNullable(files.get(e.getUpdatedFile().getId())).ifPresent(tab -> {
                        tab.updateFile(e.getUpdatedFile());
                    });
                }
            }
        };
        Communication.getBus().register(fileChangeListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(svgDataListener);
            Communication.getBus().unregister(zoomEventListener);
            Communication.getBus().unregister(saveEventListener);
            Communication.getBus().unregister(sourceActionEventListener);
            Communication.getBus().unregister(fileChangeListener);
        });

        restoreOpenedFile();
    }

    public void openTab(UUID repositoryId, RepositoryNode file) {
        if (!file.isNew() && files.containsKey(file.getId())) {
            var tab = files.get(file.getId());
            setSelectedTab(tab);
            logger.warn(">>>>> select tab " + tab.getTabId());
        }
        else {
            final var editorTab = new EditorTabComponent(id, repositoryId, file);
            editorTab.setCloseListener(this::closeTab);
            add(editorTab, editorTab.getContent());
            tabs.put(editorTab.getTabId(), editorTab);
            if (!file.isNew()) {
                files.put(file.getId(), editorTab);
            }
            setSelectedTab(editorTab);
            logger.warn(">>>>> open tab " + editorTab.getTabId());
        }
    }

    private void closeTab(EditorTabComponent tab, FileChangeReason reason) {
        tab.requestCloseTab(reason, code -> {
            remove(tab);
            tabs.remove(tab.getTabId());
            if (tab.getFileId() != null) {
                files.remove(tab.getFileId());
            }
            logger.warn(">>>>> close tab " + tab.getTabId());
        });
    }

    public void closeTab(RepositoryNode file, FileChangeReason reason) {
        Optional.ofNullable(files.get(file.getId())).ifPresent(tab -> closeTab(tab, reason));
        logger.warn(">>>>> close selected tab");
    }

    public void closeAllTabs(FileChangeReason reason) {
        var tmp = new ArrayList<EditorTabComponent>(tabs.size());
        tmp.addAll(tabs.values());
        for (EditorTabComponent tab : tmp) {
            closeTab(tab, reason);
        }
        logger.warn(">>>>> close all tabs");
    }

    public EditorTabComponent getSelectedTab() {
        return (EditorTabComponent) super.getSelectedTab();
    }

    /**
     * For future use: tab badge indicating number of errors/warnings
     * @param value
     * @return
     */
    private Span createBadge(int value) {
        Span badge = new Span(String.valueOf(value));
        badge.getElement().getThemeList().add("badge small contrast");
        badge.getStyle().set("margin-inline-start", "var(--lumo-space-xs)");
        return badge;
    }

    private void storeOpenedFile(UUID fileId) {
        var key = Authentication.playgroundModeEnabled() ? "org.archinsight.playground.file" : "org.archinsight.editor.file";
        getElement().executeJs("localStorage.setItem($0, $1)", key, fileId == null ? "" : fileId.toString());
    }

    private void restoreOpenedFile() {
        var key = Authentication.playgroundModeEnabled() ? "org.archinsight.playground.file" : "org.archinsight.editor.file";
        getElement().executeJs("return (localStorage.getItem($0) || '')", key).then(String.class, fileId -> {
            if (fileId != null && !fileId.isBlank()) {
                Communication.getBus().post(new FileRestoreEvent(UUID.fromString(fileId)));
            }
        });
    }

    @ClientCallable
    public void render(String digest, String tabId, String code) {
        Optional.ofNullable(tabs.get(tabId)).ifPresent(tab -> {
            tab.getEditor().render(digest, code);
        });
    }

    @ClientCallable
    public void cache(String digest, String tabId, String code) {
        Optional.ofNullable(tabs.get(tabId)).ifPresent(tab -> {
            tab.getEditor().cache(digest, code);
        });
    }

}
