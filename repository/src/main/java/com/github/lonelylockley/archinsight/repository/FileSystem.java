package com.github.lonelylockley.archinsight.repository;

import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

import java.util.*;
import java.util.regex.Pattern;

public class FileSystem {

    private final RepositoryNode root;
    private final HashMap<UUID, RepositoryNode> index;
    private final Pattern filenameValidator = Pattern.compile("[-_.A-Za-z0-9]");

    public FileSystem(RepositoryNode root) {
        this.root = root;
        this.index = new HashMap<>();
        walk(root, index);
    }

    private void walk(RepositoryNode from, HashMap<UUID, RepositoryNode> result) {
        from.getChildNodes().forEach(node -> {
            if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                result.put(node.getId(), node);
            }
            else
            if (RepositoryNode.TYPE_DIRECTORY.equals(node.getType())) {
                result.put(node.getId(), node);
                walk(node, result);
            }
            else {
                throw new IllegalArgumentException(String.format("Unknown file type %s", node.getType()));
            }
        });
    }

    private boolean isNameValid(String name) {
        if (name == null) {
            return false;
        }
        else {
            return filenameValidator.matcher(name).matches();
        }
    }

    public RepositoryNode createNode(RepositoryNode newNode) {
        if (newNode.getParentId() == null) {
            throw new IllegalArgumentException("Parent id is undefined for a new node");
        }
        if (!index.containsKey(newNode.getParentId())) {
            throw new IllegalArgumentException("Nonexistent directory");
        }
        if (!isNameValid(newNode.getName())) {
            throw new IllegalArgumentException("Node name is not POSIX-compliant or empty");
        }
        if (newNode.getType() == null) {
            throw new IllegalArgumentException("Node type is not set");
        }
        if (!newNode.getType().equals(RepositoryNode.TYPE_DIRECTORY) && !newNode.getType().equals(RepositoryNode.TYPE_FILE)) {
            throw new IllegalArgumentException("Incorrect node type");
        }
        var parent = index.get(newNode.getParentId());
        if (!parent.getType().equals(RepositoryNode.TYPE_DIRECTORY)) {
            throw new IllegalArgumentException("A new node may be created in directory only");
        }
        var dup = parent.getChildNodes().stream().filter(node -> node.getName().equalsIgnoreCase(newNode.getName())).findFirst();
        if (dup.isPresent()) {
            throw new IllegalArgumentException("Duplicate name");
        }
        newNode.setId(UUID.randomUUID());
        newNode.setChildNodes(new ArrayList<>());
        parent.addChild(newNode);
        return newNode;
    }

    public List<UUID> removeNode(UUID nodeId) {
        if (!index.containsKey(nodeId)) {
            throw new IllegalArgumentException("Nonexistent node");
        }
        var toDelete = index.get(nodeId);
        if (toDelete.getParentId() == null) {
            throw new IllegalArgumentException("Parent id is undefined for a node");
        }
        var parent = index.get(toDelete.getParentId());
        parent.removeChild(toDelete);
        var subTree = new HashMap<UUID, RepositoryNode>();
        walk(toDelete, subTree);
        subTree.keySet().forEach(index::remove);
        return subTree.keySet().stream().toList();
    }

    public RepositoryNode moveNode(UUID nodeId, UUID dst) {
        if (!index.containsKey(nodeId) || !index.containsKey(dst)) {
            throw new IllegalArgumentException("Nonexistent node");
        }
        var node = index.get(nodeId);
        var srcParent = index.get(node.getParentId());
        var dstParent = index.get(dst);
        if (!dstParent.getType().equals(RepositoryNode.TYPE_DIRECTORY)) {
            throw new IllegalArgumentException("A new node may be created in directory only");
        }
        srcParent.removeChild(node);
        node.setParentId(dst);
        dstParent.addChild(node);
        return node;
    }

    public RepositoryNode renameNode(UUID nodeId, String newName) {
        if (!index.containsKey(nodeId)) {
            throw new IllegalArgumentException("Nonexistent node");
        }
        var node = index.get(nodeId);
        if (!isNameValid(newName)) {
            throw new IllegalArgumentException("Node name is not POSIX-compliant or empty");
        }
        node.setName(newName);
        return node;
    }

    public RepositoryNode getNode(UUID nodeId) {
        if (!index.containsKey(nodeId)) {
            throw new IllegalArgumentException("Nonexistent node");
        }
        return index.get(nodeId);
    }

    public RepositoryNode getRoot() {
        return this.root;
    }

    public FileData nodeToFile(RepositoryNode node, UUID ownerId, UUID repositoryId) {
        var file = new FileData();
        file.setId(node.getId());
        file.setFileName(node.getName());
        file.setOwnerId(ownerId);
        file.setRepositoryId(repositoryId);
        return file;
    }

    public List<UUID> getAllFileIds(UUID repositoryId) {
        return index
                .values()
                .stream()
                .filter(node -> RepositoryNode.TYPE_FILE.equals(node.getType()))
                .map(RepositoryNode::getId)
                .toList();
    }

}
