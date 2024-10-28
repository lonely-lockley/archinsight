package com.github.lonelylockley.archinsight.model.imports;

public class GeneratedImport extends NamedImport {

    @Override
    public AbstractImport clone() {
        var res = new GeneratedImport();
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
        return "GeneratedImport{" +
                "boundedContext='" + getBoundedContext() + '\'' +
                ", level=" + getLevel() +
                ", identifier='" + getIdentifier() + '\'' +
                ", alias='" + getAlias() + '\'' +
                ", element='" + getElement() + '\'' +
                '}';
    }

}
