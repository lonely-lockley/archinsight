package com.github.lonelylockley.archinsight.model.imports;

public class AnonymousImport extends AbstractImport {

    @Override
    public String getVisibleIdentifier() {
        return null;
    }

    @Override
    public String getAlias() {
        return String.format("%s:%s.%s", getLevel(), getNamespace(), getIdentifier());
    }
}
