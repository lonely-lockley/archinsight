package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.List;

public interface WithImports {

    public void addImport(AbstractImport newImport);
    public List<AbstractImport> getImports();
}
