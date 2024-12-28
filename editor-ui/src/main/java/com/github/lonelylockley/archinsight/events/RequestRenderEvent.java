package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.ArchLevel;

import java.util.UUID;

public class RequestRenderEvent extends BaseEvent {

    private final ArchLevel level;
    private final UUID repositoryId;
    private boolean darkMode;

    public RequestRenderEvent(ArchLevel level, UUID repositoryId, Boolean darkMode) {
        this.level = level;
        this.repositoryId = repositoryId;
        this.darkMode = darkMode;
    }

    public ArchLevel getLevel() {
        return level;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }

    public boolean darkMode() {
        return darkMode;
    }
}
