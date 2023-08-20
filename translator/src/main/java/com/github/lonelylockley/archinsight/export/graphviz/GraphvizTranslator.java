package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.AnnotationType;
import com.github.lonelylockley.archinsight.model.annotations.AttributeAnnotation;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.parse.ParseResult;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class GraphvizTranslator extends TranslatorBase {

    private final List<LinkElement> connections = new ArrayList<>();

    /*
     * Collects all properties with overrides in such order:
     * - baseProperties
     * - overridden by @planned or @deprecated annotation. @planned has precedence
     * - overridden by @attribute parsed annotation value
     * This gives an opportunity to override any predefined property if needed
     */
    private Map<String, String> mergeProperties(ElementType type, Map<AnnotationType, AbstractAnnotation> annotations, Tuple2<String, String>... baseProperties) {
        Map<String, String> res = Arrays
                                    .stream(baseProperties)
                                    .collect(Collectors.toMap(Tuple2::_1, Tuple2::_2));
        if (annotations.containsKey(AnnotationType.PLANNED)) {
            res.put("fillcolor", "#0e8006");
            if (type == ElementType.LINK) {
                res.put("color", "#0e8006");
            }
        }
        else
        if (annotations.containsKey(AnnotationType.DEPRECATED)) {
            res.put("fillcolor", "#a80808");
            if (type == ElementType.LINK) {
                res.put("color", "#a80808");
            }
        }
        if (annotations.containsKey(AnnotationType.ATTRIBUTE)) {
            res.putAll(((AttributeAnnotation) annotations.get(AnnotationType.ATTRIBUTE)).getParsedValue());
        }
        return res;
    }

    private void writeElement(AbstractElement el, StringBuilder sb, int level) {
        switch (el.getType()) {
            case SYSTEM:
            case SERVICE:
                var se = (SystemElement) el;
                if (se.isExternal()) {
                    writeBlock(sb, se.getId(), se.getName(), se.getTechnology(), se.getDescription(), level, mergeProperties(
                        se.getType(),
                        se.getAnnotations(),
                        new Tuple2<>("shape", "box"),
                        new Tuple2<>("style", "filled"),
                        new Tuple2<>("fillcolor", "#999999"))
                    );
                }
                else {
                    writeBlock(sb, se.getId(), se.getName(), se.getTechnology(), se.getDescription(), level, mergeProperties(
                        se.getType(),
                        se.getAnnotations(),
                        new Tuple2<>("shape", "box"),
                        new Tuple2<>("style", "filled"),
                        new Tuple2<>("fillcolor", "#438dd5"))
                    );
                }
                break;
            case ACTOR:
                var act = (ActorElement) el;
                writeBlock(sb, act.getId(), act.getName(), act.getTechnology(), act.getDescription(), level, mergeProperties(
                        act.getType(),
                        act.getAnnotations(),
                        new Tuple2<>("shape", "egg"),
                        new Tuple2<>("style", "filled"),
                        new Tuple2<>("fillcolor", "#08427B"))
                );
                break;
            case STORAGE:
                var stor = (StorageElement) el;
                if (stor.isExternal()) {
                    writeBlock(sb, stor.getId(), stor.getName(), stor.getTechnology(), stor.getDescription(), level, mergeProperties(
                            stor.getType(),
                            stor.getAnnotations(),
                            new Tuple2<>("shape", "cylinder"),
                            new Tuple2<>("style", "filled"),
                            new Tuple2<>("fillcolor", "#4d4d4d"))
                    );
                }
                else {
                    writeBlock(sb, stor.getId(), stor.getName(), stor.getTechnology(), stor.getDescription(), level, mergeProperties(
                            stor.getType(),
                            stor.getAnnotations(),
                            new Tuple2<>("shape", "cylinder"),
                            new Tuple2<>("style", "filled"),
                            new Tuple2<>("fillcolor", "#08427B"))
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
                writeConnection(sb, c, mergeProperties(
                        c.getType(),
                        c.getAnnotations(),
                        new Tuple2<>("style", "line"))
                );
            }
            else {
                writeConnection(sb, c, mergeProperties(
                    c.getType(),
                    c.getAnnotations(),
                    new Tuple2<>("style", "dashed"),
                    new Tuple2<>("arrowhead", "open"))
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
