package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.components.helpers.TabsPersistenceHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.tabs.TabSheet;
import org.apache.directory.api.util.Strings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import java.util.stream.Collectors;

@JsModule("./src/StatePersistence.ts")
public class TabsComponent extends TabSheet {

    private static final Logger logger = LoggerFactory.getLogger(TabsComponent.class);
    private static final String id = "tabs-container";

    private final ConcurrentHashMap<String, EditorTabComponent> tabs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, EditorTabComponent> files = new ConcurrentHashMap<>();
    private final AtomicInteger restoredTabsRenderCountdownLatch = new AtomicInteger(0);
    private final RemoteSource remoteSource;
    private final TabsPersistenceHelper clientStorage;
    private final SwitchListenerHelper switchListener;

    private ArchLevel currentLevel = ArchLevel.CONTEXT;

    public TabsComponent(SwitchListenerHelper switchListener) {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        this.switchListener = switchListener;
        clientStorage = new TabsPersistenceHelper(this.getElement());
        setId(id);
        setSizeFull();
        addSelectedChangeListener(e -> {
            Communication.getBus().post(new TabSwitchEvent((EditorTabComponent) e.getPreviousTab(), (EditorTabComponent) e.getSelectedTab()));
        });

        Communication.getBus().register(this,
                new BaseListener<SvgDataEvent>() {
                    @Override
                    @Subscribe
                    public void receive(SvgDataEvent e) {
                        e.withCurrentUI(this, () -> {
                            Optional.ofNullable(tabs.get(e.getTabId())).ifPresent(tab -> tab.getView().update(e.getSvgData()));
                        });
                    }
                },

                new BaseListener<ZoomEvent>() {
                    @Override
                    @Subscribe
                    public void receive(ZoomEvent e) {
                        e.withCurrentUI(this, () -> {
                            Optional.ofNullable(getSelectedTab()).ifPresent(tab -> tab.getView().zoom(e));
                        });
                    }
                },

                new BaseListener<DoWithSourceEvent>() {
                    @Override
                    @Subscribe
                    public void receive(DoWithSourceEvent e) {
                        e.withCurrentUI(this, () -> {
                            Optional.ofNullable(getSelectedTab()).ifPresent(tab -> {
                                tab.getEditor().doWithCode(tab, tabs.values(), e.getCallback());
                            });
                        });
                    }
                },

                new BaseListener<FileChangeEvent>() {
                    @Override
                    @Subscribe
                    public void receive(FileChangeEvent e) {
                        e.withCurrentUI(this, () -> {
                            Optional.ofNullable(files.get(e.getUpdatedFile().getId())).ifPresent(tab -> {
                                tab.updateFile(e.getUpdatedFile());
                                Communication.getBus().post(new TabUpdateEvent(tab.getTabId(), tab.getFileId(), tab.getName()));
                            });
                        });
                    }
                },

                new BaseListener<SourceCompilationEvent>() {
                    @Subscribe
                    @Override
                    public void receive(SourceCompilationEvent e) {
                        e.withCurrentUI(this, () -> {
                            try {
                                // skip technical failed compilation events that don't have message errors as this
                                // causes errors blinking on frontend
                                if (e.success() || (e.failure() && !e.getMessagesByTab().isEmpty())) {
                                    var messages = e.getMessagesByTab();
                                    var summary = collectSummary(messages);
                                    updateBadges(messages, summary);
                                    createMessage(messages, summary);
                                }
                            }
                            catch (Exception ex) {
                                new NotificationComponent(ex.getMessage(), MessageLevel.ERROR, 5000);
                                logger.error("Could not render source", ex);
                            }
                        });
                    }
                },

                new BaseListener<FileSaveRequestEvent>() {
                    @Override
                    @Subscribe
                    public void receive(FileSaveRequestEvent e) {
                        e.withCurrentUI(this, () -> {
                            Optional.ofNullable(getSelectedTab()).ifPresent(tab -> {
                                if (tab.isNew()) {
                                    tab.updateFile(e.getFile());
                                    files.put(e.getFile().getId(), tab);
                                    Communication.getBus().post(new TabUpdateEvent(tab.getTabId(), tab.getFileId(), tab.getName()));
                                }
                                tab.saveSource();
                            });
                        });
                    }
                },

                new BaseListener<RequestRenderEvent>() {
                    @Override
                    @Subscribe
                    public void receive(RequestRenderEvent e) {
                        e.withCurrentUI(this, () -> {
                            currentLevel = e.getLevel();
                            tabs.forEach((key, value) -> value.setRenderer(createRenderer(switchListener.getActiveRepositoryId() , currentLevel)));
                            Optional.ofNullable(getSelectedTab()).ifPresent(tab -> {
                                remoteSource.render.render(tab.getTabId(), e.getRepositoryId(), e.getLevel(), tabs.values(), e.darkMode());
                            });
                        });
                    }
                },

                new BaseListener<EditorInsertEvent>() {
                    @Override
                    @Subscribe
                    public void receive(EditorInsertEvent e) {
                        e.withCurrentUI(this, () -> {
                            var tab = getSelectedTab();
                            if (tab != null) {
                                tab.getEditor().getElement().executeJs("""
                            var selection = this.editor.getSelection();
                            var op = {range: selection, text: $0, forceMoveMarkers: true};
                            this.editor.executeEdits('', [op]);
                            """, e.getCodeToInsert()
                                );
                            }
                        });
                    }
                },

                new BaseListener<GotoSourceEvent>() {
                    @Override
                    @Subscribe
                    public void receive(GotoSourceEvent e) {
                        e.withCurrentUI(this, () -> {
                            var tab = getSelectedTab();
                            if (tab != null) {
                                tab.getEditor().putCursorInPosition(e.getSymbol().getLine(), e.getSymbol().getStartIndex());
                            }
                        });
                    }
                },

                new BaseListener<ViewModeEvent>() {
                    @Override
                    @Subscribe
                    public void receive(ViewModeEvent e) {
                        e.withCurrentUI(this, () -> {
                            var tab = getSelectedTab();
                            if (tab != null) {
                                tab.setViewMode(e.getMode());
                            }
                        });
                    }
                });

        clientStorage.restoreOpenedTabs((tabId, restored) -> {
            if (Strings.isNotEmpty(restored.getCode())) {
                restoredTabsRenderCountdownLatch.incrementAndGet();
            }
            if (restored.getFid() != null) {
                // restore file
                Communication.getBus().post(new FileRestoreEvent(UUID.fromString(restored.getFid()), Optional.ofNullable(restored.getCode())));
            }
            else {
                // restore tab
                var file = new RepositoryNode();
                file.setType(RepositoryNode.TYPE_FILE);
                file.setName(restored.getName());
                Communication.getBus().post(new FileOpenRequestEvent(file, Optional.ofNullable(restored.getCode())));
            }
        });
    }

    private int nonNull(Integer value) {
        return value == null ? 0 : value;
    }

    public void openTab(RepositoryNode file, Optional<String> source) {
        if (!file.isNew() && files.containsKey(file.getId())) {
            var tab = files.get(file.getId());
            setSelectedTab(tab);
        }
        else {
            if (!file.isNew() && source.isEmpty()) {
                source = Optional.ofNullable(remoteSource.repository.openFile(file.getId()));
            }
            final var editorTab = new EditorTabComponent(id, file, source);
            editorTab.setRenderer(this.createRenderer(switchListener.getActiveRepositoryId(), currentLevel));
            editorTab.setCloseListener(this::closeTab);
            add(editorTab, editorTab.getContent());
            tabs.put(editorTab.getTabId(), editorTab);
            if (!file.isNew()) {
                files.put(file.getId(), editorTab);
            }
            setSelectedTab(editorTab);
            clientStorage.storeTab(editorTab, source);
            Communication.getBus().post(new TabOpenEvent(editorTab.getTabId(), file.getId(), editorTab.getName()));
        }
    }

    private BiConsumer<String, Boolean> createRenderer(UUID repositoryId, ArchLevel level) {
        return (tabId, darkMode) -> {
            remoteSource.render.render(tabId, repositoryId, level, tabs.values(), darkMode);
        };
    }

    private void closeTab(EditorTabComponent tab, FileChangeReason reason) {
        tab.requestCloseTab(reason, code -> {
            remove(tab);
            tabs.remove(tab.getTabId());
            if (tab.getFileId() != null) {
                files.remove(tab.getFileId());
            }
            clientStorage.removeTab(tab);
            Communication.getBus().post(new TabCloseEvent(tab.getTabId()));
        });
    }

    /**
     * When file was deleted
     */
    public void closeTab(List<UUID> deletedObjects, FileChangeReason reason) {
        for (UUID oid : deletedObjects) {
            Optional.ofNullable(files.get(oid)).ifPresent(tab -> closeTab(tab, reason));
        }
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

    public void activateTab(String tabId) {
        var candidate = tabs.get(tabId);
        if (candidate != null) {
            setSelectedTab(candidate);
        }
    }

    private Map<String, Map<MessageLevel, Integer>> collectSummary(Map<String, List<TranslatorMessage>> messages) {
        return messages
                .entrySet()
                .stream()
                .map(entry -> new Tuple2<>(entry.getKey(), entry.getValue().stream().collect(Collectors.toMap(TranslatorMessage::getLevel, val -> 1, Integer::sum))))
                .collect(Collectors.toMap(Tuple2::_1, Tuple2::_2));
    }

    private void updateBadges(Map<String, List<TranslatorMessage>> messages, Map<String, Map<MessageLevel, Integer>> summary) {
        for (EditorTabComponent tab : tabs.values()) {
            if (messages.containsKey(tab.getTabId())) {
                var entry = messages.get(tab.getTabId());
                tab.setModelMarkers(entry, summary.get(tab.getTabId()).getOrDefault(MessageLevel.ERROR, 0));
            }
            else {
                tab.resetModelMarkers();
            }
        }
    }

    private void createMessage(Map<String, List<TranslatorMessage>> messages, Map<String, Map<MessageLevel, Integer>> summary) {
        var msg = new StringBuilder();
        var level = MessageLevel.NOTICE;
        for (Map.Entry<String, List<TranslatorMessage>> entry : messages.entrySet()) {
            var location = entry.getValue().stream().findFirst().get().getLocation();
            var stats = summary.get(entry.getKey());
            msg
                    .append('\n')
                    .append("- In file ")
                    .append(location)
                    .append('\n')
                    .append(nonNull(stats.get(MessageLevel.ERROR)))
                    .append(" errors, ")
                    .append(nonNull(stats.get(MessageLevel.WARNING)))
                    .append(" warnings, ")
                    .append(nonNull(stats.get(MessageLevel.NOTICE)))
                    .append(" notices");
            var max = stats.keySet().stream().max(Comparator.comparingInt(MessageLevel::getPriority));
            if (max.isPresent() && max.get().getPriority() > level.getPriority()) {
                level = max.get();
            }
        }
        if (!msg.isEmpty()) {
            new NotificationComponent("Project linking complete:" + msg, level, 5000);
        }
    }

    @ClientCallable
    public void render(String digest, String tabId, String code, Boolean darkMode) {
        // each restored tab requests render. run it only once when counter reaches 0
        if (restoredTabsRenderCountdownLatch.get() > 0) {
            restoredTabsRenderCountdownLatch.decrementAndGet();
        }
        if (restoredTabsRenderCountdownLatch.get() == 0) {
            Optional.ofNullable(tabs.get(tabId)).ifPresent(tab -> {
                tab.getEditor().render(tab.getTabId(), digest, code, darkMode);
            });
        }
    }

    @ClientCallable
    public void cache(String digest, String tabId, String code) {
        Optional.ofNullable(tabs.get(tabId)).ifPresent(tab -> {
            tab.getEditor().cache(tab.getTabId(), digest, code);
        });
    }

}
