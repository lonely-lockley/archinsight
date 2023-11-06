package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.NotificationEvent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.UUID;

public class RepositorySource {

    private static final Logger logger = LoggerFactory.getLogger(RepositorySource.class);

    @Inject
    private RepositoryClient repository;
    @Inject
    private Config conf;

    public List<RepositoryInfo> listUserRepositories() {
        try {
            return repository.listUserRepositories(conf.getRepositoryAuthToken());
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public RepositoryNode listNodes(UUID repositoryId) {
        try {
            return repository.listNodes(conf.getRepositoryAuthToken(), repositoryId);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public RepositoryNode createNode(UUID repositoryId, RepositoryNode newNode) {
        try {
            return repository.createNode(conf.getRepositoryAuthToken(), repositoryId, newNode);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public List<UUID> removeNode(UUID repositoryId, UUID nodeId) {
        try {
            return repository.removeNode(conf.getRepositoryAuthToken(), repositoryId, nodeId);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public RepositoryNode renameNode(UUID repositoryId, UUID nodeId, String newName) {
        try {
            var node = new RepositoryNode();
            node.setName(newName);
            node.setId(nodeId);
            return repository.renameNode(conf.getRepositoryAuthToken(), repositoryId, node);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public String openFile(UUID fileId) {
        try {
            return repository.openFile(conf.getRepositoryAuthToken(), fileId).orElse("");
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public UUID saveFile(UUID fileId, String content) {
        try {
            return repository.saveFile(conf.getRepositoryAuthToken(), fileId, content);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public RepositoryInfo createRepository(String name) {
        try {
            var repo = new RepositoryInfo();
            repo.setName(name);
            return repository.createRepository(conf.getRepositoryAuthToken(), repo);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

    public UUID removeRepository(UUID repositoryId) {
        try {
            return repository.removeRepository(conf.getRepositoryAuthToken(), repositoryId);
        }
        catch (HttpClientResponseException ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw new RuntimeException("Remote exception: " + ex.getMessage());
        }
    }

}
