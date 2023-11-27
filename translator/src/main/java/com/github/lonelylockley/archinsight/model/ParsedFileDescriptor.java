package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.parse.ParseResult;
import com.github.lonelylockley.archinsight.parse.WithSource;

import java.util.*;

public class ParsedFileDescriptor {

    private final UUID id;
    private final String location;
    private final ParseResult parseResult;
    private final Set<AbstractImport> imports = new HashSet<>();
    private final Map<String, WithSource> declarations = new HashMap<>();
    private final Set<LinkElement> connections = new HashSet<>();

    private ArchLevel level;
    private String namespace;

    public ParsedFileDescriptor(ParseResult pr, String location, UUID fileId) {
        this.id = fileId;
        this.location = location;
        this.parseResult = pr;
        stat(pr.getRoot());
    }

    private void stat(AbstractElement el) {
        if (el.getType() == ElementType.CONTEXT) {
            this.level = ArchLevel.CONTEXT;
            this.namespace = ((WithId) el).getId();
        }
        else
        if (el.getType() == ElementType.CONTAINER) {
            level = ArchLevel.CONTAINER;
            this.namespace = ((WithId) el).getId();
        }
    }

    public void declare(WithId el) {
        declarations.put(el.getId(), (WithSource) el);
    }

    public void connect(LinkElement el) {
        connections.add(el);
    }

    public void declareForeign(WithImports el) {
        imports.addAll(el.getImports());
    }

    public Set<AbstractImport> getImports() {
        return imports;
    }

    public Map<String, WithSource> getDeclarations() {
        return declarations;
    }

    public Set<LinkElement> getConnections() {
        return connections;
    }

    public boolean isDeclared(String id) {
        return declarations.containsKey(id);
    }

    public WithSource getDeclared(String id) {
        return declarations.get(id);
    }

    public UUID getId() {
        return id;
    }

    public String getLocation() {
        return location;
    }

    public ParseResult getParseResult() {
        return parseResult;
    }

    public ArchLevel getLevel() {
        return level;
    }

    public String getNamespace() {
        return namespace;
    }
}
