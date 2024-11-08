package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.ArchLevel;

import java.util.UUID;

public class RequestRenderEvent extends BaseEvent {

    private final ArchLevel level;
    private final UUID repositoryId;

    public RequestRenderEvent(ArchLevel level, UUID repositoryId) {
        this.level = level;
        this.repositoryId = repositoryId;
    }

    public ArchLevel getLevel() {
        return level;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }

}
