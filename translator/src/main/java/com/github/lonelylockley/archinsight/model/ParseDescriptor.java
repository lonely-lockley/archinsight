package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.*;

public abstract class ParseDescriptor {

    private final String boundedContext;
    private final ArchLevel level;
    private final Set<AbstractImport> imports = new HashSet<>();
    private final Map<String, AbstractElement> existing = new HashMap<>();
    private final Map<String, AbstractElement> declared = new HashMap<>();
    private final Map<String, AbstractElement> imported = new HashMap<>();
    private final Map<String, AbstractElement> mirrored = new HashMap<>();
    private final Set<LinkElement> connections = new HashSet<>();
    private final Set<Origin> origins = new HashSet<>();

    public ParseDescriptor(String boundedContext, ArchLevel level) {
        this.boundedContext = boundedContext;
        this.level = level;
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

    public void declareElement(String id, AbstractElement el) {
        existing.put(id, el);
        declared.put(id, el);
    }

    public void declareImported(String id, AbstractElement el) {
        existing.put(id, el);
        imported.put(id, el);
    }

    public void declareMirrored(String id, AbstractElement el) {
        existing.put(id, el);
        mirrored.put(id, el);
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

    public boolean isMirrored(String id) {
        return mirrored.containsKey(id);
    }

    public boolean exists(String id) {
        return existing.containsKey(id);
    }

    public void removeExisting(String id) {
        existing.remove(id);
        declared.remove(id);
        imported.remove(id);
        mirrored.remove(id);
    }

    public AbstractElement getExisting(String id) {
        return existing.get(id);
    }

    public Map<String, AbstractElement> getAllExisting() {
        return existing;
    }

    public ArchLevel getLevel() {
        return level;
    }

    public String getBoundedContext() {
        return boundedContext;
    }

    public Collection<Origin> getOrigins() {
        return origins;
    }

    public abstract String getId();

    public abstract AbstractElement getRoot();

    public abstract ContextDescriptor getParentContext();

}
