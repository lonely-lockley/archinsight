package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class FileOpenedEvent extends BaseEvent {

    private final RepositoryNode openedFile;

    public FileOpenedEvent(RepositoryNode openedFile) {
        this.openedFile = openedFile;
    }

    public RepositoryNode getOpenedFile() {
        return openedFile;
    }

}
