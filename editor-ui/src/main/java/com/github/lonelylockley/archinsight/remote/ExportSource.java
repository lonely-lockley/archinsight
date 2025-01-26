package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.DeclarationsParsedEvent;
import com.github.lonelylockley.archinsight.events.NotificationEvent;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.*;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Singleton
public class ExportSource {

    private static final Logger logger = LoggerFactory.getLogger(RenderSource.class);

    @Inject
    private TranslatorSource translator;
    @Inject
    private RendererClient renderer;
    @Inject
    private Config conf;

    private TranslationResult translateInternal(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, boolean darkMode) {
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
            Communication.getBus().post(new SourceCompilationEvent(tabId, true, messagesByFile));
        }
        else {
            Communication.getBus().post(new SourceCompilationEvent(tabId, false, messagesByFile, filesWithErrors));
        }
        return translated;
    }

    private Source prepareRendererRequest(TranslationResult translated) {
        var res = new Source();
        res.setSource(translated.getEdited().getSource());
        return res;
    }

    private byte[] exportInternal(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, String format, Function<Source, byte[]> renderer, boolean darkMode) {
        long startTime = System.nanoTime();
        try {
            byte[] data;
            var translated = translateInternal(tabId, repositoryId, level, tabs, darkMode);
            if (!translated.isHasErrors()) {
                data = renderer.apply(prepareRendererRequest(translated));
            } else {
                throw new RuntimeException("Export failed because translation had errors");
            }
            logger.info("Export to {} required {}ms",
                    format,
                    (System.nanoTime() - startTime) / 1000000
            );
            return data;
        }
        catch (Exception ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, ex.getMessage()));
            throw ex;
        }
    }

    public byte[] exportPng(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, boolean darkMode) {
        return exportInternal(tabId, repositoryId, level, tabs, "PNG", src -> renderer.exportPng(conf.getRendererAuthToken(), src), darkMode);
    }

    public byte[] exportSvg(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, boolean darkMode) {
        return exportInternal(tabId, repositoryId, level, tabs, "SVG", src -> renderer.exportSvg(conf.getRendererAuthToken(), src), darkMode);
    }

    public byte[] exportJson(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, boolean darkMode) {
        return exportInternal(tabId, repositoryId, level, tabs, "SVG", src -> renderer.exportJson(conf.getRendererAuthToken(), src), darkMode);
    }

    public byte[] exportDot(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, boolean darkMode) {
        return translateInternal(tabId, repositoryId, level, tabs, darkMode).getEdited().getSource().getBytes(StandardCharsets.UTF_8);
    }

}
