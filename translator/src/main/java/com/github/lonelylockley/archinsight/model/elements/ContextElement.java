package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

public class ContextElement extends AbstractElement implements WithId, WithChildElements, WithImports {

    private static final ElementType type = ElementType.CONTEXT;

    private String id = null;

    private final List<AbstractElement> children = new ArrayList<>();

    private final List<AbstractImport> imports = new ArrayList<>();

    @Override
    public void setId(String id) {
        this.id = id;
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public ElementType getType() {
        return type;
    }

    public void addChild(AbstractElement child) {
        children.add(child);
    }

    @Override
    public List<AbstractElement> getChildren() {
        return children;
    }

    @Override
    public String toString() {
        return "ContextElement{" +
                "id='" + id +
                "', imports=[\n" + imports.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "', children=[\n" + children.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WithId that)) return false;
        return id.equals(that.getId());
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public void addImport(AbstractImport newImport) {
        this.imports.add(newImport);
    }

    @Override
    public List<AbstractImport> getImports() {
        return imports;
    }

}
