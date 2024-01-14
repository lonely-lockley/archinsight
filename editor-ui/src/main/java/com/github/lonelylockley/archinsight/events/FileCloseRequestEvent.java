package com.github.lonelylockley.archinsight.events;

import java.util.List;
import java.util.UUID;

public class FileCloseRequestEvent extends BaseEvent {

    private final List<UUID> deleted;
    private final FileChangeReason reason;

    public FileCloseRequestEvent(List<UUID> deleted, FileChangeReason reason) {
        this.deleted = deleted;
        this.reason = reason;
    }

    public FileChangeReason getReason() {
        return reason;
    }

    public List<UUID> getDeletedObjects() {
        return deleted;
    }

}
