package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

import java.util.Optional;
import java.util.UUID;

public class FileOpenRequestEvent extends BaseEvent {

    private final RepositoryNode file;
    private final Optional<String> source;

    public FileOpenRequestEvent(RepositoryNode file) {
        this(file, Optional.empty());
    }

    public FileOpenRequestEvent(RepositoryNode file, Optional<String> source) {
        this.file = file;
        this.source = source;
    }

    public RepositoryNode getFile() {
        return file;
    }

    public Optional<String> getSource() {
        return source;
    }
}
