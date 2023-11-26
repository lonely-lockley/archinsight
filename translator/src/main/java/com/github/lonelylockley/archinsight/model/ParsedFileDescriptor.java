package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.parse.ParseResult;
import com.github.lonelylockley.archinsight.parse.WithSource;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public class ParsedFileDescriptor {

    private final UUID id;
    private final String location;
    private final ParseResult parseResult;
    private final Set<AbstractImport> imports = new HashSet<>();
    private final Set<WithSource> declarations = new HashSet<>();
    private final Set<String> declaredIdentifiers = new HashSet<>();
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

    public void declare(WithSource el) {
        declarations.add(el);
        declaredIdentifiers.add(((WithId) el).getId());
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

    public Set<WithSource> getDeclarations() {
        return declarations;
    }

    public Set<LinkElement> getConnections() {
        return connections;
    }

    public boolean isDeclared(WithSource el) {
        return declarations.contains(el);
    }

    public boolean isDeclared(String id) {
        return declaredIdentifiers.contains(id);
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
