package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.link.model.File;
import com.github.lonelylockley.archinsight.model.LinkerMessage;
import com.github.lonelylockley.archinsight.model.MessageLevel;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.parse.ParseResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

public class Linker {

    private static final Logger logger = LoggerFactory.getLogger(Linker.class);

    public void copyPosition(LinkerMessage lm, AbstractElement el) {
        lm.setCharPosition(el.getCharPosition());
        lm.setLine(el.getLine());
        lm.setStartIndex(el.getStartIndex());
        lm.setStopIndex(el.getStopIndex());
    }

    private void checkDeclarations(File f, AbstractElement el, ArrayList<LinkerMessage> results) {
        if (el.getType() == ElementType.LINK) {
            if (f.getConnections().contains((LinkElement) el)) {
                LinkerMessage lm = new LinkerMessage(MessageLevel.WARNING, "Possible link duplication");
                copyPosition(lm, el);
                results.add(lm);
            }
            else {
                f.connect((LinkElement) el);
            }
        }
        else
        if (el.getType() != ElementType.CONTEXT && el.getType() != ElementType.CONTAINER) {
            if (f.isDeclared(el)) {
                LinkerMessage lm = new LinkerMessage(MessageLevel.ERROR, String.format("Identifier %s is already defined", ((WithId) el).getId()));
                copyPosition(lm, el);
                results.add(lm);
            }
            else {
                f.declare(el);
            }
        }
        if (el instanceof WithChildElements) {
            WithChildElements withChildren = (WithChildElements) el;
            withChildren.getChildren().forEach(ch -> checkDeclarations(f, ch, results));
        }
    }

    private void checkConnections(File f, ArrayList<LinkerMessage> results) {
        f.getConnections()
            .stream()
            .filter(c -> !f.isDeclared(c.getTo()))
            .forEach(el -> {
                LinkerMessage lm = new LinkerMessage(MessageLevel.ERROR, String.format("Undeclared identifier %s", el.getTo()));
                copyPosition(lm, el);
                results.add(lm);
            });
    }

    public List<LinkerMessage> checkIntegrity(ParseResult pr) {
        File f = new File();
        ArrayList<LinkerMessage> results = new ArrayList<>();
        checkDeclarations(f, pr.getRoot(), results);
        checkConnections(f, results);
        return results.stream().sorted(new MessageComparator()).toList();
    }
}
