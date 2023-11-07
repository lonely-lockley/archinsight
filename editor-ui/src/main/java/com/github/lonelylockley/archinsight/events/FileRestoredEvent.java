package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class FileRestoredEvent extends BaseEvent {

    private final RepositoryNode openedFile;

    public FileRestoredEvent(RepositoryNode openedFile) {
        this.openedFile = openedFile;
    }

    public RepositoryNode getOpenedFile() {
        return openedFile;
    }

}
