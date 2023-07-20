package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.parse.ParseResult;

import java.util.ArrayList;
import java.util.List;

public class GraphvizTranslator extends TranslatorBase {

    private static final List<LinkElement> connections = new ArrayList<>();

    private void writeElement(AbstractElement el, StringBuilder sb, int level) {
        switch (el.getType()) {
            case SYSTEM:
            case SERVICE:
                var se = (SystemElement) el;
                if (se.isExternal()) {
                    writeBlock(sb, se.getId(), se.getName(), se.getTechnology(), se.getDescription(), level,
                        new Tuple2<>("shape", "box"),
                        new Tuple2<>("style", "filled"),
                        new Tuple2<>("fillcolor", "#999999")
                    );
                }
                else {
                    writeBlock(sb, se.getId(), se.getName(), se.getTechnology(), se.getDescription(), level,
                        new Tuple2<>("shape", "box"),
                        new Tuple2<>("style", "filled"),
                        new Tuple2<>("fillcolor", "#438dd5")
                    );
                }
                break;
            case ACTOR:
                var act = (ActorElement) el;
                writeBlock(sb, act.getId(), act.getName(), act.getTechnology(), act.getDescription(), level,
                        new Tuple2<>("shape", "egg"),
                        new Tuple2<>("style", "filled"),
                        new Tuple2<>("fillcolor", "#08427B")
                );
                break;
            case STORAGE:
                var stor = (StorageElement) el;
                if (stor.isExternal()) {
                    writeBlock(sb, stor.getId(), stor.getName(), stor.getTechnology(), stor.getDescription(), level,
                            new Tuple2<>("shape", "cylinder"),
                            new Tuple2<>("style", "filled"),
                            new Tuple2<>("fillcolor", "#4d4d4d")
                    );
                }
                else {
                    writeBlock(sb, stor.getId(), stor.getName(), stor.getTechnology(), stor.getDescription(), level,
                            new Tuple2<>("shape", "cylinder"),
                            new Tuple2<>("style", "filled"),
                            new Tuple2<>("fillcolor", "#08427B")
                    );
                }
                break;
            default:
                break;
        }
    }

    private void traverseDeclarations(AbstractElement el, StringBuilder sb, int level) {
        if (el.getType() == ElementType.CONTEXT || el.getType() == ElementType.CONTAINER) {
            writeHeader(sb, ((WithId) el).getId());
        }
        else
        if (el.getType() == ElementType.BOUNDARY) {
            startAggregate(sb, (BoundaryElement) el, level);
        }
        else
        if (el.getType() == ElementType.LINK) {
            connections.add((LinkElement) el);
        }
        else {
            writeElement(el, sb, level);
        }

        if (el instanceof WithChildElements) {
            ((WithChildElements) el).getChildren().forEach(ch -> traverseDeclarations(ch, sb, level + 1));
        }

        if (el.getType() == ElementType.BOUNDARY) {
            finishAggregate(sb, (BoundaryElement) el, level);
        }
    }

    private void traverseConnections(StringBuilder sb) {
        connections.forEach(c -> {
            if (c.isSync()) {
                writeConnection(sb, c,
                        new Tuple2<>("style", "line")
                );
            }
            else {
                writeConnection(sb, c,
                    new Tuple2<>("style", "dashed"),
                    new Tuple2<>("arrowhead", "open")
                );
            }
        });
    }

    public String translate(ParseResult pr) {
        var res = new StringBuilder();
        traverseDeclarations(pr.getRoot(), res, 0);
        res.append('\n');
        traverseConnections(res);
        finish(res);
        return res.toString();
    }
}
