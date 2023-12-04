package com.github.lonelylockley.archinsight.events;

public class FileCloseRequestEvent extends BaseEvent {

    private final CloseReason reason;

    public FileCloseRequestEvent(CloseReason reason) {
        this.reason = reason;
    }

    public CloseReason getReason() {
        return reason;
    }

}
