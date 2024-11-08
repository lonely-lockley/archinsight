package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.AnnotationType;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class LinkElement extends AbstractElement implements WithAnnotations, WithParameters, WithNote {

    private static final ElementType<LinkElement> type = ElementType.LINK;

    private final Map<AnnotationType, AbstractAnnotation> annotations = new EnumMap<>(AnnotationType.class);

    private DynamicId from;
    private DynamicId to;
    private String name;
    private String description;
    private String technology;
    private String note;
    private boolean sync;

    public void setFrom(DynamicId from) {
        this.from = from;
    }

    public void setTo(DynamicId to) {
        this.to = to;
    }

    public void setSync() {
        this.sync = true;
    }

    public DynamicId getFrom() {
        return from;
    }

    public DynamicId getTo() {
        return to;
    }

    public boolean isSync() {
        return sync;
    }

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
    public ElementType getType() {
        return type;
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
    public String getNote() {
        return note;
    }

    @Override
    public void setNote(String note) {
        this.note = note;
    }

    @Override
    public Map<AnnotationType, AbstractAnnotation> getAnnotations() {
        return annotations;
    }

    @Override
    public AbstractElement clone() {
        var res = new LinkElement();
        res.name = this.name;
        res.description = this.description;
        res.technology = this.technology;
        this.annotations.forEach((key, value) -> res.annotations.put(key, value.clone()));
        res.from = this.from.clone();
        res.to = this.to.clone();
        res.sync = this.sync;
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "LinkElement{" +
                "from='" + from + '\'' +
                ", to='" + to + '\'' +
                ", name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                ", sync=" + sync +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        LinkElement that = (LinkElement) o;
        return sync == that.sync && from.equals(that.from) && to.equals(that.to) && Objects.equals(name, that.name) && Objects.equals(description, that.description) && Objects.equals(technology, that.technology);
    }

    @Override
    public int hashCode() {
        return Objects.hash(from, to, name, description, technology, sync);
    }
}
