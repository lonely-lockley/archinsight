package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.EmptyElement;
import com.github.lonelylockley.archinsight.model.elements.WithParameters;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.ArrayList;
import java.util.List;

public class ParseResult {

    private final AbstractElement root;
    private final List<TranslatorMessage> messages;

    public ParseResult(AbstractElement root, List<TranslatorMessage> messages) {
        if (root == null) {
            this.root = new EmptyElement();
        }
        else {
            this.root = root;
        }
        this.messages = messages;
    }

    public AbstractElement getRoot() {
        return root;
    }

    @Override
    public String toString() {
        return "ParseResult{\n%s\n}".format(root.toString());
    }

    public List<TranslatorMessage> getMessages() {
        return messages;
    }

}
