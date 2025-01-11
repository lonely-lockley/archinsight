package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.DeclarationsParsedEvent;
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
    private TranslatorClient translator;
    @Inject
    private RendererClient renderer;
    @Inject
    private Config conf;

    private TranslationRequest prepareTranslationRequest(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs) {
        var res = new TranslationRequest();
        res.setRepositoryId(repositoryId);
        res.setTabId(tabId);
        res.setLevel(level);
        var tmp = new ArrayList<TabData>(tabs.size());
        for (EditorTabComponent tab: tabs) {
            var td = new TabData();
            td.setFileName(tab.getFile().getName());
            td.setTabId(tab.getTabId());
            td.setFileId(tab.getFileId());
            td.setSource(tab.getEditor().getCachedClientCode());
            tmp.add(td);
        }
        res.setTabs(tmp);
        return res;
    }

    private TranslationResult translateInternal(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs) {
        final var translated = translator.translate(conf.getTranslatorAuthToken(), prepareTranslationRequest(tabId, repositoryId, level, tabs));
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

    private byte[] exportInternal(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs, String format, Function<Source, byte[]> renderer) {
        long startTime = System.nanoTime();
        byte[] data;
        var translated = translateInternal(tabId, repositoryId, level, tabs);
        if (!translated.isHasErrors()) {
            data = renderer.apply(prepareRendererRequest(translated));
        }
        else {
            throw new RuntimeException("Export failed because translation had errors");
        }
        logger.info("Export to {} required {}ms",
                format,
                (System.nanoTime() - startTime) / 1000000
        );
        return data;
    }

    public byte[] exportPng(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs) {
        return exportInternal(tabId, repositoryId, level, tabs, "PNG", src -> renderer.exportPng(conf.getRendererAuthToken(), src));
    }

    public byte[] exportSvg(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs) {
        return exportInternal(tabId, repositoryId, level, tabs, "SVG", src -> renderer.exportSvg(conf.getRendererAuthToken(), src));
    }

    public byte[] exportJson(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs) {
        return exportInternal(tabId, repositoryId, level, tabs, "SVG", src -> renderer.exportJson(conf.getRendererAuthToken(), src));
    }

    public byte[] exportDot(String tabId, UUID repositoryId, ArchLevel level, Collection<EditorTabComponent> tabs) {
        return translateInternal(tabId, repositoryId, level, tabs).getEdited().getSource().getBytes(StandardCharsets.UTF_8);
    }

}
