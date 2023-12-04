package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class FileCreatedEvent extends BaseEvent {

    private final RepositoryNode parent;
    private final RepositoryNode createdFile;

    public FileCreatedEvent(RepositoryNode parent, RepositoryNode createdFile) {
        this.parent = parent;
        this.createdFile = createdFile;
    }

    public RepositoryNode getCreatedFile() {
        return createdFile;
    }

    public RepositoryNode getParent() {
        return parent;
    }
}
