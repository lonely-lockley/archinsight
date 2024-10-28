package com.github.lonelylockley.archinsight.model.imports;

public class NamedImport extends AbstractImport implements Cloneable {

    @Override
    public String getVisibleIdentifier() {
        return null;
    }

    @Override
    public String getAlias() {
        return super.getAlias() == null ? getIdentifier() : super.getAlias();
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
        res.setAlias(this.getAlias());
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
