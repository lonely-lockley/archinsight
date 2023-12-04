package com.github.lonelylockley.archinsight.components.helpers;

import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.Component;

import java.util.UUID;
import java.util.function.Consumer;

public class SwitchListenerHelper {

    private final BaseListener<FileRestoredEvent> fileRestorationListener;
    private Consumer<FileRestoredEvent> fileRestorationCallback = null;
    private final BaseListener<RepositorySelectionEvent> repositorySelectionListener;
    private Consumer<RepositorySelectionEvent> repositorySelectionCallback = null;
    private final BaseListener<FileOpenRequestEvent> fileSelectionListener;
    private Consumer<FileOpenRequestEvent> fileSelectionCallback = null;
    private final BaseListener<FileCloseRequestEvent> fileCloseListener;
    private Consumer<FileCloseRequestEvent> fileCloseCallback = null;
    private final BaseListener<RepositoryCloseEvent> repositoryCloseListener;
    private Consumer<RepositoryCloseEvent> repositoryCloseCallback = null;

    private RepositoryNode openedFile;
    private RepositoryInfo activeRepository;

    public SwitchListenerHelper(Component parent) {
        repositoryCloseListener = new BaseListener<>() {
            @Override
            @Subscribe
            public void receive(RepositoryCloseEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (repositoryCloseCallback != null) {
                        repositoryCloseCallback.accept(e);
                    }
                    openedFile = null;
                    activeRepository = null;
                }
            }
        };
        Communication.getBus().register(repositoryCloseListener);

        fileCloseListener = new BaseListener<>() {
            @Override
            @Subscribe
            public void receive(FileCloseRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (fileCloseCallback != null) {
                        fileCloseCallback.accept(e);
                    }
                    openedFile = null;
                }
            }
        };
        Communication.getBus().register(fileCloseListener);

        fileSelectionListener = new BaseListener<>() {
            @Override
            @Subscribe
            public void receive(FileOpenRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (fileSelectionCallback != null) {
                        fileSelectionCallback.accept(e);
                    }
                    openedFile = e.getFile();
                }
            }
        };
        Communication.getBus().register(fileSelectionListener);

        repositorySelectionListener = new BaseListener<>() {
            @Override
            @Subscribe
            public void receive(RepositorySelectionEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (repositorySelectionCallback != null) {
                        repositorySelectionCallback.accept(e);
                    }
                    activeRepository = e.getNewValue();
                }
            }
        };
        Communication.getBus().register(repositorySelectionListener);

        fileRestorationListener = new BaseListener<>() {
            @Override
            @Subscribe
            public void receive(FileRestoredEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (fileRestorationCallback != null) {
                        fileRestorationCallback.accept(e);
                    }
                    openedFile = e.getOpenedFile();
                }
            }
        };
        Communication.getBus().register(fileRestorationListener);

        parent.addDetachListener(e -> {
            Communication.getBus().unregister(repositoryCloseListener);
            Communication.getBus().unregister(fileCloseListener);
            Communication.getBus().unregister(fileSelectionListener);
            Communication.getBus().unregister(repositorySelectionListener);
            Communication.getBus().unregister(fileRestorationListener);
        });
    }

    public void clearFileRestorationCallback() {
        fileRestorationCallback = null;
    }

    public void setFileRestorationCallback(Consumer<FileRestoredEvent> fileRestorationCallback) {
        this.fileRestorationCallback = fileRestorationCallback;
    }

    public void getRepositorySelectionCallback() {
        repositorySelectionCallback = null;
    }

    public void setRepositorySelectionCallback(Consumer<RepositorySelectionEvent> repositorySelectionCallback) {
        this.repositorySelectionCallback = repositorySelectionCallback;
    }

    public void getFileSelectionCallback() {
        fileSelectionCallback = null;
    }

    public void setFileSelectionCallback(Consumer<FileOpenRequestEvent> fileSelectionCallback) {
        this.fileSelectionCallback = fileSelectionCallback;
    }

    public void getFileCloseCallback() {
        fileCloseCallback = null;
    }

    public void setFileCloseCallback(Consumer<FileCloseRequestEvent> fileCloseCallback) {
        this.fileCloseCallback = fileCloseCallback;
    }

    public void getRepositoryCloseCallback() {
        repositoryCloseCallback = null;
    }

    public void setRepositoryCloseCallback(Consumer<RepositoryCloseEvent> repositoryCloseCallback) {
        this.repositoryCloseCallback = repositoryCloseCallback;
    }

    public boolean fileOpened() {
        return openedFile != null;
    }

    public RepositoryNode getOpenedFile() {
        return openedFile;
    }

    public UUID getOpenedFileId() {
        return openedFile == null ? null : openedFile.getId();
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
