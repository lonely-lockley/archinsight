package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.EmptyElement;
import com.github.lonelylockley.archinsight.model.elements.WithParameters;

import java.util.List;

public class ParseResult {

    private final AbstractElement root;

    public ParseResult(AbstractElement root) {
        if (root == null) {
            this.root = new EmptyElement();
        }
        else {
            this.root = root;
        }
    }

    public AbstractElement getRoot() {
        return root;
    }

    @Override
    public String toString() {
        return "ParseResult{\n%s\n}".format(root.toString());
    }

    public List<Tuple2<String, WithParameters>> getElements() {
        throw new UnsupportedOperationException();
    }

}
