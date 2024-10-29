package com.github.lonelylockley.archinsight.export;

import com.github.lonelylockley.archinsight.export.graphviz.GraphvizTranslator;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.BoundaryElement;
import com.github.lonelylockley.archinsight.model.elements.EmptyElement;
import com.github.lonelylockley.archinsight.model.elements.WithId;
import com.github.lonelylockley.archinsight.model.elements.WithParameters;
import com.github.lonelylockley.archinsight.model.remote.translator.TabData;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;

import java.util.ArrayList;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

public class Exporter {

    public void exportParsed(TranslationRequest data, TranslationResult result, TranslationContext ctx) {
        if (data.getLevel() == ArchLevel.CONTEXT) {
            exportContext(data, result, ctx);
        }
        else
        if (data.getLevel() == ArchLevel.CONTAINER) {
            exportContainer(data, result, ctx);
        }
        else {
            throw new IllegalArgumentException("Don't know how to export level: " + data.getLevel());
        }
    }

    private void exportContext(TranslationRequest data, TranslationResult result, TranslationContext ctx) {
        result.setTabs(data.getTabs());
        var tabToDescriptor = ctx
                .getDescriptors()
                .stream()
                .filter(desc -> desc.getLevel() == data.getLevel())
                .flatMap(desc -> desc.getOrigins().stream().map(origin -> new Tuple2<>(origin, desc)))
                .filter(t -> t._1.getTab().isPresent())
                .collect(Collectors.toMap(
                        t -> t._1.getTabId(),
                        Tuple2::_2
                ));
        for (TabData tab : result.getTabs()) {
            var tr = new GraphvizTranslator();
            var desc = tabToDescriptor.get(tab.getTabId());
            tab.setSource(desc == null ? GraphvizTranslator.empty("empty") : tr.translate(desc));
            if (Objects.equals(tab.getTabId(), data.getTabId())) {
                result.setEdited(tab);
            }
        }
    }

    private void exportContainer(TranslationRequest data, TranslationResult result, TranslationContext ctx) {
        result.setTabs(data.getTabs());
        var i = new AtomicInteger();
        var tabToDescriptor = ctx
                .getDescriptors()
                .stream()
                .filter(desc -> desc.getLevel() == data.getLevel())
                .flatMap(desc -> desc.getOrigins().stream().map(origin -> new Tuple2<>(origin, desc)))
                .filter(t -> t._1.getTab().isPresent())
                .map(t -> rewriteSystemElementsIntoBoundaries(t, i))
                .collect(Collectors.toMap(
                        t -> t._1.getTabId(),
                        t -> t._2,
                        ContainerAdapterDescriptor::new
                ));
        for (TabData tab : result.getTabs()) {
            var tr = new GraphvizTranslator();
            var desc = tabToDescriptor.get(tab.getTabId());
            tab.setSource(desc == null ? GraphvizTranslator.empty("empty") : tr.translate(desc));
            if (Objects.equals(tab.getTabId(), data.getTabId())) {
                result.setEdited(tab);
            }
        }
    }

    private Tuple2<Origin, ParseDescriptor> rewriteSystemElementsIntoBoundaries(Tuple2<Origin, ParseDescriptor> t, AtomicInteger i) {
        ParseDescriptor desc = t._2;
        var boundary = new BoundaryElement();
        var parent = desc.getParentContext();
        boundary.setDeclaredId(desc.getRootWithId().getDeclaredId());
        boundary.setName(((WithParameters) parent.getDeclared(desc.getRootWithId().getDeclaredId())).getName());
        var tmp = new ArrayList<>(desc.getRootWithChildren().getChildren());
        desc.getRootWithChildren().getChildren().clear();
        tmp.forEach(child -> {
            var id = child.hasId().fold(WithId::getDeclaredId, null);
            if (desc.isDeclared(id)) {
                boundary.addChild(child);
            }
            else {
                desc.getRootWithChildren().addChild(child);
            }
        });
        desc.getRootWithChildren().getChildren().add(boundary);
        if (boundary.getChildren().isEmpty()) {
            boundary.getChildren().add(new EmptyElement("invisible_node_" + i.incrementAndGet()));
        }
        return new Tuple2<>(t._1, desc);
    }

}
