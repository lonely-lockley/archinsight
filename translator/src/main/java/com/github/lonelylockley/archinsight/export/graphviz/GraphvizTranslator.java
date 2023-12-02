package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.AnnotationType;
import com.github.lonelylockley.archinsight.model.annotations.AttributeAnnotation;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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

    private void writeSystemElement(SystemElement se, StringBuilder sb, int level) {
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
        if (se.getNote() != null) {
            writeNote(se, se, sb, level);
        }
    }

    private void writeServiceElement(ServiceElement se, StringBuilder sb, int level) {
        writeSystemElement(se, sb, level);
    }

    private void writeActorElement(ActorElement act, StringBuilder sb, int level) {
        writeBlock(sb, act.getId(), act.getName(), act.getTechnology(), act.getDescription(), level, mergeProperties(
                act.getType(),
                act.getAnnotations(),
                new Tuple2<>("shape", "egg"),
                new Tuple2<>("style", "filled"),
                new Tuple2<>("fillcolor", "#08427B"))
        );
        if (act.getNote() != null) {
            writeNote(act, act, sb, level);
        }
    }

    private void writeStorageElement(StorageElement stor, StringBuilder sb, int level) {
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
        if (stor.getNote() != null) {
            writeNote(stor, stor, sb, level);
        }
    }

    private void writeNote(WithId wid, WithNote wn, StringBuilder sb, int level) {
        var id = wid.getId() + "_note";
        var text = wn.getNote().substring(1).trim();
        writeBlock(sb, id, null, null, text, level, Stream.of(
                            new Tuple2<>("shape", "note"),
                            new Tuple2<>("style", "filled"),
                            new Tuple2<>("fillcolor", "#faf6a2"),
                            new Tuple2<>("fontcolor", "#000000"),
                            new Tuple2<>("color", "#edce07")
                        )
                        .collect(Collectors.toMap(Tuple2::_1, Tuple2::_2))
        );
        var c = new LinkElement();
        c.setFrom(id);
        c.setTo(wid.getId());
        writeConnection(sb, c, Stream.of(
                                new Tuple2<>("color", "#edce07"),
                                new Tuple2<>("dir", "none"),
                                new Tuple2<>("penwidth", "1"),
                                new Tuple2<>("minlen", "0.2"),
                                new Tuple2<>("maxlen", "1")
                            )
                            .collect(Collectors.toMap(Tuple2::_1, Tuple2::_2))
        );
    }

    private void traverseImports(ParsedFileDescriptor descriptor, StringBuilder sb) {
        descriptor.getImports().forEach(i -> {
            var el = descriptor.getDeclared(i.getAlias());
            traverseDeclarations(el, sb, 1);
        });
    }

    private void traverseDeclarations(AbstractElement el, StringBuilder sb, int level) {
        if (el.getType() == ElementType.EMPTY) {
            ElementType.EMPTY.capture(el).foreach(ee -> sb.append(empty(ee.getId())));
        }
        else
        if (el.getType() == ElementType.CONTEXT || el.getType() == ElementType.CONTAINER) {
            ElementType.CONTEXT.capture(el).foreach(c -> writeHeader(sb, c.getId()));
        }
        else
        if (el.getType() == ElementType.BOUNDARY) {
            ElementType.BOUNDARY.capture(el).foreach(be -> startAggregate(sb, be, level));
        }
        else
        if (el.getType() == ElementType.LINK) {
            ElementType.LINK.capture(el).foreach(connections::add);
        }
        else
        if (el.getType() == ElementType.SYSTEM) {
            ElementType.SYSTEM.capture(el).foreach(se -> writeSystemElement(se, sb, level));
        }
        else
        if (el.getType() == ElementType.SERVICE) {
            ElementType.SERVICE.capture(el).foreach(se -> writeServiceElement(se, sb, level));
        }
        else
        if (el.getType() == ElementType.ACTOR) {
            ElementType.ACTOR.capture(el).foreach(ae -> writeActorElement(ae, sb, level));
        }
        else
        if (el.getType() == ElementType.STORAGE) {
            ElementType.STORAGE.capture(el).foreach(se -> writeStorageElement(se, sb, level));
        }

        if (el instanceof WithChildElements) {
            ((WithChildElements) el).getChildren().forEach(ch -> traverseDeclarations(ch, sb, level + 1));
        }

        if (el.getType() == ElementType.BOUNDARY) {
            ElementType.BOUNDARY.capture(el).foreach(be -> finishAggregate(sb, be, level));
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

    public String translate(ParsedFileDescriptor descriptor) {
        var root = descriptor.getParseResult().getRoot();
        if (root.getType() == ElementType.EMPTY) {
            return empty("empty");
        }
        else {
            var res = new StringBuilder();
            traverseDeclarations(root, res, 0);
            traverseImports(descriptor, res);
            res.append('\n');
            traverseConnections(res);
            finish(res);
            return res.toString();
        }
    }
}
