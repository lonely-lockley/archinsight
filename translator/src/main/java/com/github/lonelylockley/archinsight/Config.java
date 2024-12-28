package com.github.lonelylockley.archinsight;

import io.micronaut.context.annotation.ConfigurationProperties;
import io.micronaut.context.annotation.Property;
import jakarta.inject.Singleton;

import java.util.HashMap;
import java.util.UUID;

@Singleton
@ConfigurationProperties("archinsight")
public class Config {
    private String repositoryAuthToken;
    private HashMap<String, Object> diagram;

    public String getRepositoryAuthToken() {
        return String.format("Bearer %s", repositoryAuthToken);
    }

    public void setRepositoryAuthToken(String repositoryAuthToken) {
        this.repositoryAuthToken = repositoryAuthToken;
    }

    public HashMap<String, Object> getDiagram() {
        return diagram;
    }

    public void setDiagram(HashMap<String, Object> diagram) {
        this.diagram = diagram;
    }
}
