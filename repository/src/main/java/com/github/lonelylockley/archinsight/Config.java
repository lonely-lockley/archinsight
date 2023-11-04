package com.github.lonelylockley.archinsight;

import io.micronaut.context.annotation.ConfigurationProperties;
import jakarta.inject.Singleton;

import java.util.UUID;

@Singleton
@ConfigurationProperties("archinsight")
public class Config {
    private UUID playgroundRepositoryId;

    public UUID getPlaygroundRepositoryId() {
        return playgroundRepositoryId;
    }

    public void setPlaygroundRepositoryId(UUID playgroundRepositoryId) {
        this.playgroundRepositoryId = playgroundRepositoryId;
    }
}
