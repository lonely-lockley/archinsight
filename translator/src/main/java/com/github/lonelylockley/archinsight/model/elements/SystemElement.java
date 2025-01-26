package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.AnnotationType;

import java.util.*;
import java.util.stream.Collectors;

public class SystemElement extends AbstractElement implements WithId, WithParameters, WithAnnotations, WithExternal, WithChildElements, WithNote {

    private final Map<AnnotationType, AbstractAnnotation> annotations = new EnumMap<>(AnnotationType.class);
    private final List<AbstractElement> children = new ArrayList<>();

    private DynamicId declaredId;
    private String name;
    private String description;
    private String technology;
    private boolean external;
    private String note;

    @Override
    public void addChild(AbstractElement child) {
        children.add(child);
    }

    @Override
    public List<AbstractElement> getChildren() {
        return children;
    }

    @Override
    public void setExternal() {
        external = true;
    }

    @Override
    public boolean isExternal() {
        return external;
    }

    @Override
    public void setDeclaredId(DynamicId id) {
        this.declaredId = id;
    }

    @Override
    public DynamicId getDeclaredId() {
        return declaredId;
    }

    @Override
    public void setName(String name) {
        this.name = name;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public void setDescription(String description) {
        this.description = description;
    }

    @Override
    public String getDescription() {
        return description;
    }

    @Override
    public void setTechnology(String tech) {
        this.technology = tech;
    }

    @Override
    public String getTechnology() {
        return technology;
    }

    @Override
    public ElementType<SystemElement> getType() {
        return ElementType.SYSTEM;
    }

    @Override
    public void addAllAnnotations(List<AbstractAnnotation> annotations) {
        annotations.forEach(this::addAnnotation);
    }

    @Override
    public void addAnnotation(AbstractAnnotation annotation) {
        annotations.put(annotation.getAnnotationType(), annotation);
    }

    @Override
    public Map<AnnotationType, AbstractAnnotation> getAnnotations() {
        return annotations;
    }

    @Override
    public AbstractElement clone() {
        var res = new SystemElement();
        res.note = this.note;
        res.declaredId = this.declaredId.clone();
        res.name = this.name;
        res.description = this.description;
        res.technology = this.technology;
        res.external = this.external;
        this.annotations.forEach((key, value) -> res.annotations.put(key, value.clone()));
        this.children.forEach(child -> res.children.add(child.clone()));
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "SystemElement{" +
                "declaredId='" + declaredId + '\'' +
                ", name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                ", external=" + external +
                ", children=[\n" + children.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
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
    public void setNote(String note) {
        this.note = note;
    }

    @Override
    public String getNote() {
        return note;
    }
}
