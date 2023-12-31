package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.parse.ParseResult;

import java.util.*;

public class ParsedFileDescriptor {

    private final Optional<String> tabId;
    private final Optional<UUID> fileId;
    private final String location;
    private final ParseResult parseResult;
    private final Set<AbstractImport> imports = new HashSet<>();
    private final Map<String, AbstractElement> declarations = new HashMap<>();
    private final Set<LinkElement> connections = new HashSet<>();

    private ArchLevel level;
    private String namespace;

    public ParsedFileDescriptor(ParseResult pr, String location, Optional<String> tabId, Optional<UUID> fileId) {
        this.tabId = tabId;
        this.fileId = fileId;
        this.location = location;
        this.parseResult = pr;
        stat(pr.getRoot());
    }

    private void stat(AbstractElement el) {
        if (el.getType() == ElementType.CONTEXT) {
            this.level = ArchLevel.CONTEXT;
        }
        else
        if (el.getType() == ElementType.CONTAINER) {
            this.level = ArchLevel.CONTAINER;
        }
        el.hasId().foreach(wid -> this.namespace = wid.getId());
    }

    public void declare(String id, AbstractElement el) {
        declarations.put(id, el);
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

    public Map<String, AbstractElement> getDeclarations() {
        return declarations;
    }

    public Set<LinkElement> getConnections() {
        return connections;
    }

    public boolean isDeclared(String id) {
        return declarations.containsKey(id);
    }

    public AbstractElement getDeclared(String id) {
        return declarations.get(id);
    }

    public String getId() {
        return tabId.or(() -> fileId.map(UUID::toString)).orElseThrow();
    }

    public Optional<String> getTabId() {
        return tabId;
    }

    public Optional<UUID> getFileId() {
        return fileId;
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
