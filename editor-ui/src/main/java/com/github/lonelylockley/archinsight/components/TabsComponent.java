package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.google.common.eventbus.Subscribe;
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

    private final ConcurrentHashMap<String, EditorTabComponent> tabs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, EditorTabComponent> files = new ConcurrentHashMap<>();
    private final RemoteSource remoteSource;
    private final SwitchListenerHelper switchListener;

    public TabsComponent(SwitchListenerHelper switchListener) {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        this.switchListener = switchListener;
        setSizeFull();

        final var svgDataListener = new BaseListener<SvgDataEvent>() {
            @Override
            @Subscribe
            public void receive(SvgDataEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                Optional.of(tabs.get(e.getTabId())).ifPresent(tab -> tab.getView().update(e.getSvgData()));
            }
            }
        };
        Communication.getBus().register(svgDataListener);
        final var zoomEventListener = new BaseListener<ZoomEvent>() {
            @Override
            @Subscribe
            public void receive(ZoomEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                Optional.of(getSelectedTab()).ifPresent(tab -> tab.getView().zoom(e));
            }
            }
        };
        Communication.getBus().register(zoomEventListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(svgDataListener);
            Communication.getBus().unregister(zoomEventListener);
        });
    }

    public void openTab(UUID repositoryId, RepositoryNode file) {
        if (files.containsKey(file.getId())) {
            var tab = files.get(file.getId());
            setSelectedTab(tab);
            logger.warn(">>>>> select tab " + tab.getTabId());
        }
        else {
            final var editorTab = new EditorTabComponent(repositoryId, file);
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
            files.remove(tab.getFileId());
            logger.warn(">>>>> close tab " + tab.getTabId());
        });
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

}
