package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

import java.util.Optional;
import java.util.UUID;

public class FileOpenRequestEvent extends BaseEvent {

    private final UUID repositoryId;
    private final RepositoryNode file;
    private final Optional<String> source;

    public FileOpenRequestEvent(UUID repositoryId, RepositoryNode file) {
        this(repositoryId, file, Optional.empty());
    }

    public FileOpenRequestEvent(UUID repositoryId, RepositoryNode file, Optional<String> source) {
        this.repositoryId = repositoryId;
        this.file = file;
        this.source = source;
    }

    public RepositoryNode getFile() {
        return file;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }

    public Optional<String> getSource() {
        return source;
    }
}
