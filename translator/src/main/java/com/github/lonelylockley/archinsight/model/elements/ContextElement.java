package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

public class ContextElement extends AbstractElement implements WithId, WithChildElements, WithImports {

    private DynamicId declaredId = null;

    private final List<AbstractElement> children = new ArrayList<>();

    private final List<AbstractImport> imports = new ArrayList<>();

    @Override
    public void setDeclaredId(DynamicId id) {
        this.declaredId = id;
    }

    @Override
    public DynamicId getDeclaredId() {
        return declaredId;
    }

    @Override
    public ElementType<ContextElement> getType() {
        return ElementType.CONTEXT;
    }

    public void addChild(AbstractElement child) {
        children.add(child);
    }

    @Override
    public List<AbstractElement> getChildren() {
        return children;
    }

    @Override
    public AbstractElement clone() {
        var res = new ContextElement();
        res.declaredId = this.declaredId.clone();
        this.imports.forEach(imp -> res.imports.add(imp.clone()));
        this.children.forEach(child -> res.children.add(child.clone()));
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "ContextElement{" +
                "declaredId='" + declaredId +
                "', imports=[\n" + imports.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "', children=[\n" + children.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WithId that)) return false;
        return declaredId.equals(that.getDeclaredId());
    }

    @Override
    public int hashCode() {
        return Objects.hash(declaredId);
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
