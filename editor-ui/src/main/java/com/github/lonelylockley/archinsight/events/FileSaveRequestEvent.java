package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class FileSaveRequestEvent extends BaseEvent {

    private final RepositoryNode file;
    private final FileChangeReason reason;

    public FileSaveRequestEvent(RepositoryNode file, FileChangeReason reason) {
        this.file = file;
        this.reason = reason;
    }

    public FileChangeReason getReason() {
        return reason;
    }

    public RepositoryNode getFile() {
        return file;
    }
}
