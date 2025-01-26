package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.Collection;
import java.util.Objects;

public class DynamicId implements Cloneable {

    private ArchLevel level;
    private String boundedContext;
    private String boundaryId;
    private String elementId;

    private boolean changed = true;
    private String declaredId;

    public static DynamicId empty() {
       return new DynamicId();
    }

    public static DynamicId fromElementId(String id) {
        var res = new DynamicId();
        res.setElementId(id);
        return res;
    }

    public static DynamicId fromImport(AbstractImport imp) {
        var res = new DynamicId();
        res.level = imp.getLevel();
        res.boundedContext = imp.getBoundedContext();
        res.elementId = imp.getElement();
        res.boundaryId = imp.getIdentifier();
        return res;
    }

    public static DynamicId fromAbstractElements(ArchLevel level, String boundedContext, Collection<String> boundaryIds) {
        var res = new DynamicId();
        res.setLevel(level);
        res.setBoundedContext(boundedContext);
        res.setBoundaryId(String.join("+", boundaryIds));
        return res;
    }

    public static DynamicId fromLink(LinkElement link) {
        var res = new DynamicId();
        res.setElementId(String.format("%s-->%s", link.getFrom(), link.getTo()));
        return res;
    }

    private DynamicId() {
    }

    public ArchLevel getLevel() {
        return level;
    }

    public void setLevel(ArchLevel level) {
        changed = true;
        this.level = level;
    }

    public String getBoundedContext() {
        return boundedContext;
    }

    public void setBoundedContext(String boundedContext) {
        changed = true;
        this.boundedContext = boundedContext;
    }

    public String getBoundaryId() {
        return boundaryId;
    }

    public void setBoundaryId(String boundaryId) {
        changed = true;
        this.boundaryId = boundaryId;
    }

    public String getElementId() {
        return elementId;
    }

    public void setElementId(String elementId) {
        changed = true;
        this.elementId = elementId;
    }

    private void generateDeclaredId() {
        var sb = new StringBuilder();
        var previousValueExists = false;
        if (level != null) {
            sb.append(level);
            previousValueExists = true;
        }
        if (boundedContext != null) {
            if (previousValueExists) {
                sb.append("__");
            }
            sb.append(boundedContext);
            previousValueExists = true;
        }
        if (boundaryId != null) {
            if (previousValueExists) {
                sb.append("__");
            }
            sb.append(boundaryId);
            previousValueExists = true;
        }
        if (elementId != null) {
            if (previousValueExists) {
                sb.append("__");
            }
            sb.append(elementId);
        }
        declaredId = sb.toString();
    }

    @Override
    public String toString() {
        if (changed) {
            generateDeclaredId();
            changed = false;
        }
        return declaredId;
    }

    @Override
    public DynamicId clone() {
        var res = new DynamicId();
        res.level = level;
        res.boundedContext = boundedContext;
        res.boundaryId = boundaryId;
        res.elementId = elementId;
        res.changed = changed;
        res.declaredId = declaredId;
        return res;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        DynamicId dynamicId = (DynamicId) o;
        return Objects.equals(toString(), dynamicId.toString());
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(toString());
    }
}
