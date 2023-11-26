package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.UUID;

public class TranslationRequest {
    private String source;
    private UUID fileId;
    private UUID repositoryId;

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public UUID getFileId() {
        return fileId;
    }

    public void setFileId(UUID fileId) {
        this.fileId = fileId;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }

    public void setRepositoryId(UUID repositoryId) {
        this.repositoryId = repositoryId;
    }
}
