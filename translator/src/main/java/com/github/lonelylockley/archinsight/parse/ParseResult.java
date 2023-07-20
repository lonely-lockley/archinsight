package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.WithId;
import com.github.lonelylockley.archinsight.model.elements.WithParameters;

import java.util.List;

public class ParseResult {

    private final AbstractElement root;

    public ParseResult(AbstractElement root) {
        this.root = root;
    }

    public AbstractElement getRoot() {
        return root;
    }

    public String getProjectName() {
        return ((WithId) root).getId();
    }

    public ElementType getLevel() {
        return root.getType();
    }

    @Override
    public String toString() {
        return "ParseResult{\n%s\n}".format(root.toString());
    }

    public List<Tuple2<String, WithParameters>> getElements() {
        throw new UnsupportedOperationException();
    }

    public boolean hasContext() {
        return root.getType() == ElementType.CONTEXT;
    }

    public boolean hasContainer() {
        return root.getType() == ElementType.CONTAINER;
    }

}
