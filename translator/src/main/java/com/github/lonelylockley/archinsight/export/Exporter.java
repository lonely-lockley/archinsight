package com.github.lonelylockley.archinsight.export;

import com.github.lonelylockley.archinsight.export.graphviz.GraphvizTranslator;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.remote.translator.TabData;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;

import java.util.Objects;
import java.util.stream.Collectors;

public class Exporter {

    public void exportParsed(TranslationRequest data, TranslationResult result, TranslationContext ctx, ColorScheme colorScheme) {
        result.setTabs(data.getTabs());
        var tabToDescriptor = ctx
                .getDescriptors()
                .stream()
                .filter(desc -> desc.getLevel() == data.getLevel())
                .flatMap(desc -> desc.getOrigins().stream().map(origin -> new Tuple2<>(origin, desc)))
                .filter(t ->
                        t._1.getTab().isPresent())
                .collect(Collectors.toMap(
                        t -> t._1.getTabId(),
                        Tuple2::_2
                ));
        for (TabData tab : result.getTabs()) {
            var tr = new GraphvizTranslator(colorScheme);
            var desc = tabToDescriptor.get(tab.getTabId());
            tab.setSource(desc == null ? GraphvizTranslator.empty("empty") : tr.translate(desc));
            if (Objects.equals(tab.getTabId(), data.getTabId())) {
                result.setEdited(tab);
            }
        }
    }

}
