package com.github.lonelylockley.archinsight.repository;

import com.github.lonelylockley.archinsight.exceptionhandling.ServiceException;
import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import io.micronaut.http.HttpStatus;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.regex.Pattern;

public class FileSystem {

    public static final String POSIX_FILE_NAME_PTR = "^[-_.A-Za-z0-9][-_.A-Za-z0-9]+$";

    private final RepositoryNode root;
    private final HashMap<UUID, RepositoryNode> index;
    private final Pattern filenameValidator = Pattern.compile(POSIX_FILE_NAME_PTR);

    public FileSystem(RepositoryNode root) {
        this.root = root;
        this.index = new HashMap<>();
        walk(root, index);
    }

    private void walk(RepositoryNode from, HashMap<UUID, RepositoryNode> result) {
        result.put(from.getId(), from);
        if (from.getChildNodes() != null) {
            from.getChildNodes().forEach(node -> {
                if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                    result.put(node.getId(), node);
                }
                else if (RepositoryNode.TYPE_DIRECTORY.equals(node.getType())) {
                    result.put(node.getId(), node);
                    walk(node, result);
                }
                else {
                    throw new ServiceException(new ErrorMessage(String.format("Unknown file type %s", node.getType())));
                }
            });
        }
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
            throw new ServiceException(new ErrorMessage("Parent id is undefined for a new node"));
        }
        if (!index.containsKey(newNode.getParentId())) {
            throw new ServiceException(new ErrorMessage("Nonexistent directory"));
        }
        if (!isNameValid(newNode.getName())) {
            throw new ServiceException(new ErrorMessage("Node name is not POSIX-compliant or empty"));
        }
        if (newNode.getType() == null) {
            throw new ServiceException(new ErrorMessage("Node type is not set"));
        }
        if (!newNode.getType().equals(RepositoryNode.TYPE_DIRECTORY) && !newNode.getType().equals(RepositoryNode.TYPE_FILE)) {
            throw new ServiceException(new ErrorMessage("Incorrect node type"));
        }
        var parent = index.get(newNode.getParentId());
        if (!parent.getType().equals(RepositoryNode.TYPE_DIRECTORY)) {
            throw new ServiceException(new ErrorMessage("A new node may be created in directory only"));
        }
        var dup = parent.getChildNodes().stream().filter(node -> node.getName().equalsIgnoreCase(newNode.getName())).findFirst();
        if (dup.isPresent()) {
            throw new ServiceException(new ErrorMessage("Already exists"));
        }
        newNode.setId(UUID.randomUUID());
        newNode.setChildNodes(new ArrayList<>());
        parent.addChild(newNode);
        return newNode;
    }

    public List<UUID> removeNode(UUID nodeId) {
        if (!index.containsKey(nodeId)) {
            throw new ServiceException(new ErrorMessage("Nonexistent node"));
        }
        if (RepositoryNode.ROOT_UUID.equals(nodeId)) {
            throw new ServiceException(new ErrorMessage("Operation is not permitted"));
        }
        var toDelete = index.get(nodeId);
        if (toDelete.getParentId() == null) {
            throw new ServiceException(new ErrorMessage("Parent id is undefined for a node"));
        }
        var parent = index.get(toDelete.getParentId());
        parent.removeChild(toDelete);
        var subTree = new HashMap<UUID, RepositoryNode>();
        walk(toDelete, subTree);
        subTree.keySet().forEach(index::remove);
        return subTree.keySet().stream().toList();
    }

    // this method is not exposed to UI now. not tested
    public RepositoryNode moveNode(UUID nodeId, UUID dst) {
        if (!index.containsKey(nodeId) || !index.containsKey(dst)) {
            throw new ServiceException(new ErrorMessage("Nonexistent node"));
        }
        if (RepositoryNode.ROOT_UUID.equals(nodeId)) {
            throw new ServiceException(new ErrorMessage("Operation is not permitted"));
        }
        var node = index.get(nodeId);
        var srcParent = index.get(node.getParentId());
        var dstParent = index.get(dst);
        if (!dstParent.getType().equals(RepositoryNode.TYPE_DIRECTORY)) {
            throw new ServiceException(new ErrorMessage("A new node may be created in directory only"));
        }
        if (dstParent.getId().equals(nodeId)) {
            throw new ServiceException(new ErrorMessage("Destination directory cannot be the same as source"));
        }
        srcParent.removeChild(node);
        node.setParentId(dst);
        dstParent.addChild(node);
        return node;
    }

    public RepositoryNode renameNode(UUID nodeId, String newName) {
        if (!index.containsKey(nodeId)) {
            throw new ServiceException(new ErrorMessage("Nonexistent node"));
        }
        if (RepositoryNode.ROOT_UUID.equals(nodeId)) {
            throw new ServiceException(new ErrorMessage("Operation is not permitted"));
        }
        var node = index.get(nodeId);
        if (!isNameValid(newName)) {
            throw new ServiceException(new ErrorMessage("Node name is not POSIX-compliant or empty"));
        }
        var parent = index.get(node.getParentId());
        var dup = parent.getChildNodes().stream().filter(existing -> existing.getName().equalsIgnoreCase(node.getName())).findFirst();
        if (dup.isPresent()) {
            throw new ServiceException(new ErrorMessage("Already exists", HttpStatus.BAD_REQUEST));
        }
        node.setName(newName);
        return node;
    }

    public RepositoryNode getNode(UUID nodeId) {
        if (!index.containsKey(nodeId)) {
            throw new ServiceException(new ErrorMessage("Nonexistent node"));
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

    public RepositoryNode getClosestDirectory(RepositoryNode selected) {
        if (RepositoryNode.TYPE_DIRECTORY.equals(selected.getType())) {
            return selected;
        }
        return getClosestDirectory(index.get(selected.getParentId()));
    }

    public <T> void walkRepositoryStructureWithState(BiFunction<RepositoryNode, T, T> callback, T initialState) {
        walkRepositoryStructureWithState(callback, initialState, this.root);
    }

    private <T> void walkRepositoryStructureWithState(BiFunction<RepositoryNode, T, T> callback, T state, RepositoryNode root) {
        var newState = callback.apply(root, state);
        if (root.getChildNodes() != null) {
            root.getChildNodes().forEach(ch -> {
                if (RepositoryNode.TYPE_FILE.equalsIgnoreCase(ch.getType())) {
                    // ignore state for files
                    callback.apply(ch, newState);
                }
                else {
                    walkRepositoryStructureWithState(callback, newState, ch);
                }
            });
        }
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
