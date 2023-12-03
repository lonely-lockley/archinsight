package com.github.lonelylockley.archinsight;

import io.micronaut.context.annotation.ConfigurationProperties;
import jakarta.inject.Singleton;

import java.util.UUID;

@Singleton
@ConfigurationProperties("archinsight")
public class Config {
    private String repositoryAuthToken;

    public String getRepositoryAuthToken() {
        return String.format("Bearer %s", repositoryAuthToken);
    }

    public void setRepositoryAuthToken(String repositoryAuthToken) {
        this.repositoryAuthToken = repositoryAuthToken;
    }

}
