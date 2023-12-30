package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.helpers.TabsPersistenceHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.tabs.TabSheet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@JsModule("./src/StatePersistence.ts")
public class TabsComponent extends TabSheet {

    private static final Logger logger = LoggerFactory.getLogger(TabsComponent.class);
    private static final String id = "tabs-container";

    private final ConcurrentHashMap<String, EditorTabComponent> tabs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, EditorTabComponent> files = new ConcurrentHashMap<>();
    private final TabsPersistenceHelper clientStorage;

    public TabsComponent() {
        clientStorage = new TabsPersistenceHelper(this.getElement());
        setId(id);
        setSizeFull();
        addSelectedChangeListener(e -> {
            var tab = (EditorTabComponent) e.getSelectedTab();
//            if (tab == null || tab.isNew()) {
//                clientStorage.removeTab(tab);
//            }
//            else {
//                storeOpenedFile(tab.getFileId());
//            }
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

        clientStorage.restoreOpenedTabs((tabId, restored) -> {
            if (restored.getFid() != null) {
                Communication.getBus().post(new FileRestoreEvent(UUID.fromString(restored.getFid()), Optional.ofNullable(restored.getCode())));
            }
            else {
                var file = new RepositoryNode();
                file.setType(RepositoryNode.TYPE_FILE);
                file.setName(restored.getName());
                Communication.getBus().post(new FileOpenRequestEvent(null, file, Optional.ofNullable(restored.getCode())));
                //openTab(null, file, Optional.ofNullable(restored.getCode()));
            }
        });
        clientStorage.restoreOpenedFileLegacy();
    }

    public void openTab(UUID repositoryId, RepositoryNode file, Optional<String> source) {
        if (!file.isNew() && files.containsKey(file.getId())) {
            var tab = files.get(file.getId());
            setSelectedTab(tab);
        }
        else {
            final var editorTab = new EditorTabComponent(id, repositoryId, file, source);
            editorTab.setCloseListener(this::closeTab);
            add(editorTab, editorTab.getContent());
            tabs.put(editorTab.getTabId(), editorTab);
            if (!file.isNew()) {
                files.put(file.getId(), editorTab);
            }
            setSelectedTab(editorTab);
            clientStorage.storeTab(editorTab, source);
        }
    }

    private void closeTab(EditorTabComponent tab, FileChangeReason reason) {
        tab.requestCloseTab(reason, code -> {
            remove(tab);
            tabs.remove(tab.getTabId());
            if (tab.getFileId() != null) {
                files.remove(tab.getFileId());
            }
            clientStorage.removeTab(tab);
        });
    }

    /**
     * When file was deleted
     */
    public void closeTab(RepositoryNode file, FileChangeReason reason) {
        Optional.ofNullable(files.get(file.getId())).ifPresent(tab -> closeTab(tab, reason));
    }

    public void closeAllTabs(FileChangeReason reason) {
        var tmp = new ArrayList<EditorTabComponent>(tabs.size());
        tmp.addAll(tabs.values());
        for (EditorTabComponent tab : tmp) {
            closeTab(tab, reason);
        }
        clientStorage.clearState();
    }

    public EditorTabComponent getSelectedTab() {
        return (EditorTabComponent) super.getSelectedTab();
    }

    /**
     * For future use: tab badge indicating number of errors/warnings
     */
    private void createBadge(EditorTabComponent tab, int numberOfErrors) {
        Span badge = new Span(String.valueOf(numberOfErrors));
        badge.getElement().getThemeList().add("badge small contrast");
        badge.getStyle().set("margin-inline-start", "var(--lumo-space-xs)");
        tab.add(badge);
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
            tab.setHasErrorsOrEmpty();
            tab.getEditor().cache(digest, code);
        });
    }

}
