package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class FileOpenRequestEvent extends BaseEvent {

    private final RepositoryNode file;

    public FileOpenRequestEvent(RepositoryNode file) {
        this.file = file;
    }

    public RepositoryNode getFile() {
        return file;
    }

}
