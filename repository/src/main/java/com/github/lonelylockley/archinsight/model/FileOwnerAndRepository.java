package com.github.lonelylockley.archinsight.model;

import java.util.UUID;

public class FileOwnerAndRepository {

    private UUID ownerId;
    private UUID repositoryId;

    public UUID getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(UUID ownerId) {
        this.ownerId = ownerId;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }

    public void setRepositoryId(UUID repositoryId) {
        this.repositoryId = repositoryId;
    }
}
