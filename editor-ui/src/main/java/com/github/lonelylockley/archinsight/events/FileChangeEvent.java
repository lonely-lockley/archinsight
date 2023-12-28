package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class FileChangeEvent extends BaseEvent {
    private final RepositoryNode updatedFile;

    public FileChangeEvent(RepositoryNode updatedFile) {
        this.updatedFile = updatedFile;
    }

    public RepositoryNode getUpdatedFile() {
        return updatedFile;
    }
}
