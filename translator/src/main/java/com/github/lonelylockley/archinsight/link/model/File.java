package com.github.lonelylockley.archinsight.link.model;

import com.github.lonelylockley.archinsight.parse.WithSource;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.elements.WithId;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

public class File {

    private final ArrayList<String> imports = new ArrayList<>();
    private final Set<WithSource> declarations = new HashSet<>();
    private final Set<String> declaredIdentifiers = new HashSet<>();
    private final Set<LinkElement> connections = new HashSet<>();

    public void declare(WithSource el) {
        declarations.add(el);
        declaredIdentifiers.add(((WithId) el).getId());
    }

    public void connect(LinkElement el) {
        connections.add(el);
    }

    public ArrayList<String> getImports() {
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

}
