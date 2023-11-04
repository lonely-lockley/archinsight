package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
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
        return repository.listUserRepositories(conf.getRepositoryAuthToken());
    }

    public RepositoryNode listNodes(UUID repositoryId) {
        return repository.listNodes(conf.getRepositoryAuthToken(), repositoryId);
    }

    public RepositoryNode createNode(UUID repositoryId, RepositoryNode newNode) {
        return repository.createNode(conf.getRepositoryAuthToken(), repositoryId, newNode);
    }

    public List<UUID> removeNode(UUID repositoryId, UUID nodeId) {
        return repository.removeNode(conf.getRepositoryAuthToken(), repositoryId, nodeId);
    }

    public RepositoryNode renameNode(UUID repositoryId, UUID nodeId, String newName) {
        var node = new RepositoryNode();
        node.setName(newName);
        node.setId(nodeId);
        return repository.renameNode(conf.getRepositoryAuthToken(), repositoryId, node);
    }

}
