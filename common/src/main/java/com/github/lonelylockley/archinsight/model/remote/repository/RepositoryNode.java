package com.github.lonelylockley.archinsight.model.remote.repository;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

public class RepositoryNode implements Serializable {

    public static final String TYPE_FILE = "f";
    public static final String TYPE_DIRECTORY = "d";
    public static final UUID ROOT_UUID = UUID.fromString("1ad2ba2c-10a6-4f5f-997a-029065a700bc");

    private UUID id;
    private UUID parentId;
    private String name;
    private String type;
    private List<RepositoryNode> childNodes = new ArrayList<>();

    private RepositoryNode(UUID id, String name, String type, List<RepositoryNode> childNodes) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.childNodes = childNodes;
    }

    public static RepositoryNode createRoot() {
        return new RepositoryNode(ROOT_UUID, "/", TYPE_DIRECTORY, new ArrayList<>());
    }

    public RepositoryNode() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getParentId() {
        return parentId;
    }

    public void setParentId(UUID parentId) {
        this.parentId = parentId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<RepositoryNode> getChildNodes() {
        return childNodes;
    }

    public void setChildNodes(List<RepositoryNode> childNodes) {
        this.childNodes = childNodes;
    }

    public void addChild(RepositoryNode newNode) {
        if (this.childNodes == null) {
            this.childNodes = new ArrayList<>();
        }
        this.childNodes.add(newNode);
    }

    public void removeChild(RepositoryNode child) {
        this.childNodes.remove(child);
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    @JsonIgnore
    public boolean isNew() {
        return id == null;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        RepositoryNode that = (RepositoryNode) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "RepositoryNode{" +
                "id=" + id +
                ", parentId=" + parentId +
                ", name='" + name + '\'' +
                ", type='" + type + '\'' +
                ", childNodes=[\n" + childNodes.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }
}
