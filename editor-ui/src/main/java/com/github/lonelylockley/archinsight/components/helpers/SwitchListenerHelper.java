package com.github.lonelylockley.archinsight.components.helpers;

import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.Component;

import java.util.UUID;
import java.util.function.Consumer;

public class SwitchListenerHelper {

    private Consumer<TabSwitchEvent> tabSwitchCallback = null;
    private Consumer<RepositorySelectionEvent> repositorySelectionCallback = null;
    private Consumer<FileOpenRequestEvent> fileSelectionCallback = null;
    private Consumer<FileCloseRequestEvent> fileCloseCallback = null;
    private Consumer<RepositoryCloseEvent> repositoryCloseCallback = null;

    private RepositoryInfo activeRepository;

    public SwitchListenerHelper(Component parent) {
        Communication.getBus().register(parent,
                new BaseListener<RepositoryCloseEvent>() {
                    @Override
                    @Subscribe
                    public void receive(RepositoryCloseEvent e) {
                        e.withCurrentUI(this, () -> {
                            if (repositoryCloseCallback != null) {
                                repositoryCloseCallback.accept(e);
                            }
                            activeRepository = null;
                        });
                    }
                },

                new BaseListener<FileCloseRequestEvent>() {
                    @Override
                    @Subscribe
                    public void receive(FileCloseRequestEvent e) {
                        e.withCurrentUI(this, () -> {
                            if (fileCloseCallback != null) {
                                fileCloseCallback.accept(e);
                            }
                        });
                    }
                },

                new BaseListener<FileOpenRequestEvent>() {
                    @Override
                    @Subscribe
                    public void receive(FileOpenRequestEvent e) {
                        e.withCurrentUI(this, () -> {
                            if (fileSelectionCallback != null) {
                                fileSelectionCallback.accept(e);
                            }
                        });
                    }
                },

                new BaseListener<RepositorySelectionEvent>() {
                    @Override
                    @Subscribe
                    public void receive(RepositorySelectionEvent e) {
                        e.withCurrentUI(this, () -> {
                            if (repositorySelectionCallback != null) {
                                repositorySelectionCallback.accept(e);
                            }
                            activeRepository = e.getNewValue();
                        });
                    }
                },

                new BaseListener<TabSwitchEvent>() {
                    @Override
                    @Subscribe
                    public void receive(TabSwitchEvent e) {
                        e.withCurrentUI(this, () -> {
                            if (tabSwitchCallback != null) {
                                tabSwitchCallback.accept(e);
                            }
                        });
                    }
                });
    }

    public void setTabSwitchCallback(Consumer<TabSwitchEvent> tabSwitchCallback) {
        this.tabSwitchCallback = tabSwitchCallback;
    }

    public void setRepositorySelectionCallback(Consumer<RepositorySelectionEvent> repositorySelectionCallback) {
        this.repositorySelectionCallback = repositorySelectionCallback;
    }

    public void setFileSelectionCallback(Consumer<FileOpenRequestEvent> fileSelectionCallback) {
        this.fileSelectionCallback = fileSelectionCallback;
    }

    public void setFileCloseCallback(Consumer<FileCloseRequestEvent> fileCloseCallback) {
        this.fileCloseCallback = fileCloseCallback;
    }

    public void setRepositoryCloseCallback(Consumer<RepositoryCloseEvent> repositoryCloseCallback) {
        this.repositoryCloseCallback = repositoryCloseCallback;
    }

    public boolean repositoryOpened() {
        return activeRepository != null;
    }

    public RepositoryInfo getActiveRepository() {
        return activeRepository;
    }

    public UUID getActiveRepositoryId() {
        return activeRepository == null ? null : activeRepository.getId();
    }

}
