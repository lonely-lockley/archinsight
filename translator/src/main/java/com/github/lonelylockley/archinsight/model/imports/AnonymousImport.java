package com.github.lonelylockley.archinsight.model.imports;

import com.github.lonelylockley.archinsight.model.ArchLevel;

public class AnonymousImport extends AbstractImport {

    public AnonymousImport() {
        setLevel(ArchLevel.CONTAINER);
    }

    @Override
    public String getVisibleIdentifier() {
        return null;
    }

    @Override
    public String getAlias() {
        return String.format("%s__%s__%s", getLevel(), getElement(), getIdentifier());
    }

    @Override
    public boolean isAnonymous() {
        return true;
    }

    @Override
    public AbstractImport clone() {
        var res = new AnonymousImport();
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

}
