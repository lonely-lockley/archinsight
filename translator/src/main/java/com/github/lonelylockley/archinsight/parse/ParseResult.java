package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.Origin;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.EmptyElement;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.List;

public class ParseResult {

    private final Origin origin;
    private final AbstractElement root;
    private final List<TranslatorMessage> messages;

    public ParseResult(Origin origin, AbstractElement root, List<TranslatorMessage> messages) {
        if (root == null) {
            this.root = new EmptyElement();
        }
        else {
            this.root = root;
        }
        this.origin = origin;
        this.messages = messages;
    }

    public AbstractElement getRoot() {
        return root;
    }

    public Origin getOrigin() {
        return origin;
    }

    @Override
    public String toString() {
        return "ParseResult{" +
                "origin=" + origin +
                ", root=" + root +
                '}';
    }

    public List<TranslatorMessage> getMessages() {
        return messages;
    }

}
