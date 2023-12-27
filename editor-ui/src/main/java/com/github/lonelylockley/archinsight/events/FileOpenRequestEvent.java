package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

import java.util.UUID;

public class FileOpenRequestEvent extends BaseEvent {

    private final UUID repositoryId;
    private final RepositoryNode file;

    public FileOpenRequestEvent(UUID repositoryId, RepositoryNode file) {
        this.repositoryId = repositoryId;
        this.file = file;
    }

    public RepositoryNode getFile() {
        return file;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }
}
