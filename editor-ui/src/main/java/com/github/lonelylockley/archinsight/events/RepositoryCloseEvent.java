package com.github.lonelylockley.archinsight.events;

public class RepositoryCloseEvent extends BaseEvent {

    private final FileChangeReason reason;

    public RepositoryCloseEvent(FileChangeReason reason) {
        this.reason = reason;
    }

    public FileChangeReason getReason() {
        return reason;
    }
}
