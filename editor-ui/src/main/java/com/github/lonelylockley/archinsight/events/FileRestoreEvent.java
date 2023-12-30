package com.github.lonelylockley.archinsight.events;

import java.util.Optional;
import java.util.UUID;

public class FileRestoreEvent extends BaseEvent {

    private final UUID fileId;
    private final Optional<String> source;

    public FileRestoreEvent(UUID fileId, Optional<String> source) {
        this.fileId = fileId;
        this.source = source;
    }

    public FileRestoreEvent(UUID fileId) {
        this(fileId, Optional.empty());
    }

    public UUID getRestoredFileId() {
        return fileId;
    }

    public Optional<String> getSource() {
        return source;
    }
}
