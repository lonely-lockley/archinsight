package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.*;

public abstract class ParseDescriptor {

    private final String boundedContext;
    private final DynamicId parentContextId;
    private final ArchLevel level;
    private final AbstractElement parentElement;
    private final Set<AbstractImport> imports = new HashSet<>();
    private final Map<DynamicId, AbstractElement> existing = new HashMap<>();
    private final Map<String, AbstractElement> declared = new HashMap<>();
    private final Map<String, AbstractElement> imported = new HashMap<>();
    private final Map<String, AbstractElement> mirrored = new HashMap<>();
    private final Set<LinkElement> connections = new HashSet<>();
    private final Set<Origin> origins = new HashSet<>();

    public ParseDescriptor(DynamicId parentContextId, String boundedContext, ArchLevel level, AbstractElement parentElement) {
        this.parentContextId = parentContextId;
        this.boundedContext = boundedContext;
        this.level = level;
        this.parentElement = parentElement;
    }

    public void addImport(AbstractImport el) {
        imports.add(el);
    }

    public void replaceImport(AbstractImport from, AbstractImport to) {
        imports.remove(from);
        imports.add(to);
    }

    public void addConnection(LinkElement el) {
        connections.add(el);
    }

    public void addConnections(Set<LinkElement> el) {
        connections.addAll(el);
    }

    public void declareElement(DynamicId id, String elementId, AbstractElement el) {
        existing.put(id, el);
        declared.put(elementId, el);
    }

    public void declareImported(DynamicId id, String importId, AbstractElement el) {
        existing.put(id, el);
        imported.put(importId, el);
    }

    public void declareMirrored(DynamicId id, String mirrorId, AbstractElement el) {
        existing.put(id, el);
        mirrored.put(mirrorId, el);
    }

    public Set<Map.Entry<String, AbstractElement>> listMirroredEntries() {
        return mirrored.entrySet();
    }

    public Set<AbstractImport> getImports() {
        return imports;
    }

    public Set<LinkElement> getConnections() {
        return connections;
    }

    public boolean isDeclared(String id) {
        return declared.containsKey(id);
    }

    public AbstractElement getDeclared(String id) {
        return declared.get(id);
    }

    public boolean isImported(String id) {
        return imported.containsKey(id);
    }

    public AbstractElement getImported(String id) {
        return imported.get(id);
    }

    public Collection<String> listImported() {
        return imported.keySet();
    }

    public boolean isMirrored(String id) {
        return mirrored.containsKey(id);
    }

    public boolean exists(DynamicId id) {
        return existing.containsKey(id);
    }

    public AbstractElement getExisting(DynamicId id) {
        return existing.get(id);
    }

    public void removeExisting(DynamicId id, String existingId) {
        existing.remove(id);
        declared.remove(existingId);
        imported.remove(existingId);
        mirrored.remove(existingId);
    }

    public Map<DynamicId, AbstractElement> listExisting() {
        return existing;
    }

    public ArchLevel getLevel() {
        return level;
    }

    public AbstractElement getParentElement() {
        return parentElement;
    }

    public String getBoundedContext() {
        return boundedContext;
    }

    public Collection<Origin> getOrigins() {
        return origins;
    }

    public DynamicId getParentContextId() {
        return parentContextId;
    }

    public abstract DynamicId getId();

    public abstract AbstractElement getRoot();

    public abstract WithId getRootWithId();

    public abstract WithChildElements getRootWithChildren();

    public abstract WithImports getRootWithImports();

    public void mergeTo(ParseDescriptor dst) {
        dst.imports.addAll(this.imports);
        dst.declared.putAll(this.declared);
        dst.imported.putAll(this.imported);
        dst.mirrored.putAll(this.mirrored);
        dst.existing.putAll(this.existing);
        dst.origins.addAll(this.origins);
        dst.connections.addAll(this.connections);
    }

}
