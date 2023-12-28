package com.github.lonelylockley.archinsight.events;

import java.util.UUID;

public class FileRestoreEvent extends BaseEvent {

    private final UUID fileId;

    public FileRestoreEvent(UUID fileId) {
        this.fileId = fileId;
    }

    public UUID getRestoredFileId() {
        return fileId;
    }

}
