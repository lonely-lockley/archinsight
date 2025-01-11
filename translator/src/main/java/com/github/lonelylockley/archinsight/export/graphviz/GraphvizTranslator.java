package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.export.ColorScheme;
import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.AnnotationType;
import com.github.lonelylockley.archinsight.model.annotations.AttributeAnnotation;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class GraphvizTranslator extends TranslatorBase {

    private final Set<String> addedNotes = new HashSet<>();

    public GraphvizTranslator(ColorScheme colorScheme) {
        super(colorScheme);
    }

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
            res.put("fillcolor", colorScheme.getPlanned());
            if (type == ElementType.LINK) {
                res.put("color", colorScheme.getPlanned());
            }
        }
        else
        if (annotations.containsKey(AnnotationType.DEPRECATED)) {
            res.put("fillcolor", colorScheme.getDeprecated());
            if (type == ElementType.LINK) {
                res.put("color", colorScheme.getDeprecated());
            }
        }
        if (annotations.containsKey(AnnotationType.ATTRIBUTE)) {
            res.putAll(((AttributeAnnotation) annotations.get(AnnotationType.ATTRIBUTE)).getParsedValue());
        }
        return res;
    }

    private void writeSystemElement(SystemElement se, StringBuilder sb, int level) {
        if (se.isExternal()) {
            writeBlock(sb, se.getDeclaredId().toString(), se.getDeclaredId().toString(), se.getName(), se.getTechnology(), se.getDescription(), level, mergeProperties(
                    se.getType(),
                    se.getAnnotations(),
                    new Tuple2<>("shape", "box"),
                    new Tuple2<>("style", "filled"),
                    new Tuple2<>("fillcolor", colorScheme.getExternal()))
            );
        }
        else {
            writeBlock(sb, se.getDeclaredId().toString(), se.getDeclaredId().toString(), se.getName(), se.getTechnology(), se.getDescription(), level, mergeProperties(
                    se.getType(),
                    se.getAnnotations(),
                    new Tuple2<>("shape", "box"),
                    new Tuple2<>("style", "filled"),
                    new Tuple2<>("fillcolor", colorScheme.getInternal()))
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
        writeBlock(sb, act.getDeclaredId().toString(), act.getDeclaredId().toString(), act.getName(), act.getTechnology(), act.getDescription(), level, mergeProperties(
                act.getType(),
                act.getAnnotations(),
                new Tuple2<>("shape", "box"),
                new Tuple2<>("style", "filled,rounded"),
                new Tuple2<>("fillcolor", colorScheme.getActor()))
        );
        if (act.getNote() != null) {
            writeNote(act, act, sb, level);
        }
    }

    private void writeStorageElement(StorageElement stor, StringBuilder sb, int level) {
        if (stor.isExternal()) {
            writeBlock(sb, stor.getDeclaredId().toString(), stor.getDeclaredId().toString(), stor.getName(), stor.getTechnology(), stor.getDescription(), level, mergeProperties(
                    stor.getType(),
                    stor.getAnnotations(),
                    new Tuple2<>("shape", "cylinder"),
                    new Tuple2<>("style", "filled"),
                    new Tuple2<>("fillcolor", colorScheme.getExternalInfra()))
            );
        }
        else {
            writeBlock(sb, stor.getDeclaredId().toString(), stor.getDeclaredId().toString(), stor.getName(), stor.getTechnology(), stor.getDescription(), level, mergeProperties(
                    stor.getType(),
                    stor.getAnnotations(),
                    new Tuple2<>("shape", "cylinder"),
                    new Tuple2<>("style", "filled"),
                    new Tuple2<>("fillcolor", colorScheme.getInternalInfra()))
            );
        }
        if (stor.getNote() != null) {
            writeNote(stor, stor, sb, level);
        }
    }

    private void writeNote(WithId wid, WithNote wn, StringBuilder sb, int level) {
        var id = wid.getDeclaredId().toString() + "_note";
        if (!addedNotes.contains(id)) {
            var text = wn.getNote().substring(1).trim();
            writeBlock(sb, null, id, null, null, text, level, Stream.of(
                                    new Tuple2<>("shape", "note"),
                                    new Tuple2<>("style", "filled"),
                                    new Tuple2<>("fillcolor", "#faf6a2"),
                                    new Tuple2<>("fontcolor", "#000000"),
                                    new Tuple2<>("color", "#edce07")
                            )
                            .collect(Collectors.toMap(Tuple2::_1, Tuple2::_2))
            );
            var c = new LinkElement();
            c.setFrom(DynamicId.fromElementId(id));
            c.setTo(wid.getDeclaredId());
            writeConnection(sb, c, Stream.of(
                                    new Tuple2<>("color", "#edce07"),
                                    new Tuple2<>("dir", "none"),
                                    new Tuple2<>("penwidth", "1"),
                                    new Tuple2<>("minlen", "0.2"),
                                    new Tuple2<>("maxlen", "1")
                            )
                            .collect(Collectors.toMap(Tuple2::_1, Tuple2::_2))
            );
            addedNotes.add(id);
        }
    }

    private void writeInvisibleElement(WithId wid, StringBuilder sb, int level) {
        writeBlock(sb, null, wid.getDeclaredId().toString(), "", null, null, level, mergeProperties(
                wid.getType(),
                Collections.emptyMap(),
                new Tuple2<>("shape", "point"),
                new Tuple2<>("style", "invis"))
        );
    }

    private void traverseDeclarations(AbstractElement el, StringBuilder sb, int level) {
        if (el.getType() == ElementType.CONTEXT) {
            ElementType.CONTEXT.capture(el).foreach(c -> writeHeader(sb, c.getDeclaredId().toString()));
        }
        else
        if (el.getType() == ElementType.CONTAINER) {
            ElementType.CONTAINER.capture(el).foreach(c -> writeHeader(sb, c.getDeclaredId().toString()));
        }
        else
        if (el.getType() == ElementType.BOUNDARY) {
            ElementType.BOUNDARY.capture(el).foreach(be -> startAggregate(sb, be, level));
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
        else
        if (el.getType() == ElementType.EMPTY) {
            ElementType.EMPTY.capture(el).foreach(em -> writeInvisibleElement(em, sb, level));
        }

        el.hasChildren().foreach(hasChildren -> hasChildren.getChildren().forEach(ch -> traverseDeclarations(ch, sb, level + 1)));

        if (el.getType() == ElementType.BOUNDARY) {
            ElementType.BOUNDARY.capture(el).foreach(be -> finishAggregate(sb, be, level));
        }
    }

    private void traverseConnections(StringBuilder sb, Collection<LinkElement> connections) {
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

    public String translate(ParseDescriptor descriptor) {
        var root = descriptor.getRoot();
        if (root.getType() == ElementType.EMPTY) {
            return empty("empty");
        }
        else {
            var res = new StringBuilder();
            traverseDeclarations(root, res, 0);
            res.append('\n');
            traverseConnections(res, descriptor.getConnections());
            finish(res);
            return res.toString();
        }
    }
}
