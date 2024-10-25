package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.Functional;
import com.github.lonelylockley.archinsight.parse.HasType;
import com.github.lonelylockley.archinsight.parse.WithSource;

import java.util.UUID;

public abstract class AbstractElement extends WithSource implements HasType, Cloneable {

    private final UUID uniqueId = UUID.randomUUID();

    public UUID getUniqueId() {
        return uniqueId;
    }

    @Override
    public AbstractElement clone() {
        return this;
    }

    public Functional<WithId, WithId> hasId() {
        if (this instanceof WithId hasId) {
            return (new Functional<WithId, WithId>() {}).capture(hasId);
        }
        else {
            return (new Functional<WithId, WithId>() {}).noop();
        }
    }

    public Functional<WithChildElements, WithChildElements> hasChildren() {
        if (this instanceof WithChildElements hasChildren) {
            return (new Functional<WithChildElements, WithChildElements>() {}).capture(hasChildren);
        }
        else {
            return (new Functional<WithChildElements, WithChildElements>() {}).noop();
        }
    }

    public Functional<WithExternal, WithExternal> hasExternal() {
        if (this instanceof WithExternal hasExternal) {
            return (new Functional<WithExternal, WithExternal>() {}).capture(hasExternal);
        }
        else {
            return (new Functional<WithExternal, WithExternal>() {}).noop();
        }
    }

    public Functional<WithAnnotations, WithAnnotations> hasAnnotations() {
        if (this instanceof WithAnnotations hasAnnotations) {
            return (new Functional<WithAnnotations, WithAnnotations>() {}).capture(hasAnnotations);
        }
        else {
            return new Functional<WithAnnotations, WithAnnotations>() {}.noop();
        }
    }

    public Functional<WithImports, WithImports> hasImports() {
        if (this instanceof WithImports hasImports) {
            return (new Functional<WithImports, WithImports>() {}).capture(hasImports);
        }
        else {
            return (new Functional<WithImports, WithImports>() {}).noop();
        }
    }

    public Functional<WithNote, WithNote> hasNote() {
        if (this instanceof WithNote hasNote) {
            return (new Functional<WithNote, WithNote>() {}).capture(hasNote);
        }
        else {
            return (new Functional<WithNote, WithNote>() {}).noop();
        }
    }

    public Functional<WithParameters, WithParameters> hasParameters() {
        if (this instanceof WithParameters hasParameters) {
            return (new Functional<WithParameters, WithParameters>() {}).capture(hasParameters);
        }
        else {
            return (new Functional<WithParameters, WithParameters>() {}).noop();
        }
    }

}
