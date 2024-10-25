package com.github.lonelylockley.archinsight.model.imports;

public class NamedImport extends AbstractImport {

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
}
