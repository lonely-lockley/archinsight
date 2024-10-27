package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.Functional;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class ElementType<T extends AbstractElement> implements Functional<T, AbstractElement> {
    // any level
    public static final ElementType<LinkElement> LINK = new ElementType<>("LINKS");

    // context level
    public static final ElementType<SystemElement> SYSTEM = new ElementType<>("SYSTEM");
    public static final ElementType<ActorElement> ACTOR = new ElementType<>("ACTOR");

    // container level
    public static final ElementType<ServiceElement> SERVICE = new ElementType<>("SERVICE");
    public static final ElementType<StorageElement> STORAGE = new ElementType<>("STORAGE");

    // other
    public static final ElementType<ContextElement> CONTEXT = new ElementType<>("CONTEXT");
    public static final ElementType<ContainerElement> CONTAINER = new ElementType<>("CONTAINER");
    public static final ElementType<BoundaryElement> BOUNDARY = new ElementType<>("BOUNDARY");

    // special case
    public static final ElementType<EmptyElement> UNKNOWN = new ElementType<>("unk");
    public static final ElementType<EmptyElement> EMPTY = new ElementType<>("empty");

    private final String id;

    private ElementType(String identifier) {
        this.id = identifier;
    }

    private static final Map<String, ElementType> byId = new HashMap<>();
    static {
        byId.put(LINK.id, LINK);
        byId.put(SYSTEM.id, SYSTEM);
        byId.put(ACTOR.id, ACTOR);
        byId.put(SERVICE.id, SERVICE);
        byId.put(STORAGE.id, STORAGE);
        byId.put(CONTEXT.id, CONTEXT);
        byId.put(CONTAINER.id, CONTAINER);
        byId.put(BOUNDARY.id, BOUNDARY);
        byId.put(UNKNOWN.id, UNKNOWN);
        byId.put(EMPTY.id, EMPTY);
    }

    public static ElementType elementByIdentifier(String identifier) {
        ElementType et = byId.get(identifier);
        if (et == null) {
            et = UNKNOWN;
        }
        return et;
    }

    public String getId() {
        return id;
    }

    @Override
    public String toString() {
        return id;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ElementType<?> that = (ElementType<?>) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public Functional<T, AbstractElement> capture(AbstractElement param) {
        if (param.getType() == byId.get(id)) {
            return Functional.super.capture(param);
        }
        else {
            return Functional.super.noop();
        }
    }
}
