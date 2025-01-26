package com.github.lonelylockley.archinsight.model.imports;

import com.github.lonelylockley.archinsight.model.DynamicId;

public class NamedImport extends AbstractImport implements Cloneable {

    @Override
    public String getVisibleIdentifier() {
        return null;
    }

    @Override
    public DynamicId getAlias() {
        return super.getAliasInternal() == null ? DynamicId.fromElementId(super.getIdentifier()) : DynamicId.fromElementId(super.getAliasInternal());
    }

    @Override
    public boolean isAnonymous() {
        return false;
    }

    @Override
    public AbstractImport clone() {
        var res = new NamedImport();
        res.setLevel(this.getLevel());
        res.setLevelSource(this.getLevelSource());
        res.setBoundedContext(this.getBoundedContext());
        res.setBoundedContextSource(this.getBoundedContextSource());
        res.setIdentifier(this.getIdentifier());
        res.setIdentifierSource(this.getIdentifierSource());
        res.setElement(this.getElement());
        res.setElementSource(this.getElementSource());
        res.setAlias(this.getAliasInternal());
        res.setAliasSource(this.getAliasSource());
        res.setOrigination(this.getOriginalDescriptor(), this.getOriginalElement());
        this.clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "NamedImport{" +
                "boundedContext='" + getBoundedContext() + '\'' +
                ", level=" + getLevel() +
                ", identifier='" + getIdentifier() + '\'' +
                ", alias='" + getAlias() + '\'' +
                ", element='" + getElement() + '\'' +
                '}';
    }
}
