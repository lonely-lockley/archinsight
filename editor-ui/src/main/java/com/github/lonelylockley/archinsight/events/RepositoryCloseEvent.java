package com.github.lonelylockley.archinsight.events;

public class RepositoryCloseEvent extends BaseEvent {

    private final CloseReason reason;

    public RepositoryCloseEvent(CloseReason reason) {
        this.reason = reason;
    }

    public CloseReason getReason() {
        return reason;
    }
}
