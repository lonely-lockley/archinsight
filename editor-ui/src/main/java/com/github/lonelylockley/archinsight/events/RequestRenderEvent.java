package com.github.lonelylockley.archinsight.events;

import java.util.UUID;

public class RequestRenderEvent extends BaseEvent {

    private final UUID repositoryId;

    public RequestRenderEvent(UUID repositoryId) {
        this.repositoryId = repositoryId;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }
}
