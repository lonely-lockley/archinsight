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

    public ParseDescriptor(String boundedContext, ArchLevel level) {
        this.boundedContext = boundedContext;
        this.level = level;
    }

    public void addImports(WithImports el) {
        imports.addAll(el.getImports());
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

    public boolean isImported(String id) {
        return imported.containsKey(id);
    }

    public boolean isMirrored(String id) {
        return mirrored.containsKey(id);
    }

    public boolean exists(String id) {
        return existing.containsKey(id);
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

    public abstract String getId();

    public abstract AbstractElement getRoot();

    public abstract ContextDescriptor getParentContext();

    public abstract Collection<Origin> getOrigins();

}
