package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.DeclarationsParsedEvent;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.*;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.stream.Collectors;

public class RenderSource {

    private static final Logger logger = LoggerFactory.getLogger(RenderSource.class);

    @Inject
    private TranslatorSource translator;
    @Inject
    private RendererClient renderer;
    @Inject
    private Config conf;

    private List<Source> prepareRendererRequest(TranslationResult translated) {
        return translated.getTabs().stream().map(td -> {
            var res = new Source();
            res.setTabId(td.getTabId());
            res.setSource(td.getSource());
            return res;
        }).toList();
    }

    public void render(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, boolean darkMode) {
        long startTime = System.nanoTime();
        final var translated = translator.translate(tabId, repositoryId, level, darkMode, tabs);
        final var messages = translated.getMessages() == null ? Collections.<TranslatorMessage>emptyList() : translated.getMessages();
        final var filesWithErrors = new HashSet<UUID>();
        final var messagesByFile = messages
                .stream()
                .map(tm -> {
                    if (tm.getFileId() != null && tm.getLevel() == MessageLevel.ERROR) {
                        filesWithErrors.add(tm.getFileId());
                    }
                    return tm;
                })
                .collect(Collectors.toMap(
                    TranslatorMessage::getTabId,
                    msg -> {
                        List<TranslatorMessage> lst = new ArrayList<>();
                        lst.add(msg);
                        return lst;
                    },
                    (res, msg) -> {
                        res.addAll(msg);
                        return res;
                    })
                );
        if (!translated.isHasErrors()) {
            var diagrams = renderer.renderSvgBatch(conf.getRendererAuthToken(), prepareRendererRequest(translated));
            for (Source svg : diagrams) {
                Communication.getBus().post(new SvgDataEvent(svg.getTabId(), svg.getSource()));
            }
            Communication.getBus().post(new SourceCompilationEvent(tabId, true, messagesByFile));
        }
        else {
            Communication.getBus().post(new SourceCompilationEvent(tabId, false, messagesByFile, filesWithErrors));
        }
        logger.info("Render for {} required {}ms", tabId, (System.nanoTime() - startTime) / 1000000);
    }

}
