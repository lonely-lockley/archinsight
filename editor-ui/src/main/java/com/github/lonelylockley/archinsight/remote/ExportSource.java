package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.vaadin.flow.component.UI;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
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

    private TranslationRequest prepareTranslationRequest(String code, UUID repositoryId, UUID fileId) {
        var res = new TranslationRequest();
        res.setSource(code);
        res.setRepositoryId(repositoryId);
        res.setFileId(fileId);
        return res;
    }

    private TranslationResult translateInternal(String tabId, UUID repositoryId, UUID fileId, String code) {
        var translated = translator.translate(conf.getTranslatorAuthToken(), prepareTranslationRequest(code, repositoryId, fileId));
        var messages = translated.getMessages() == null ? Collections.<TranslatorMessage>emptyList() : translated.getMessages();
        var messagesByFile = messages.stream().collect(Collectors.toMap(
                TranslatorMessage::getFileId,
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
            Communication.getBus().post(new SourceCompilationEvent(tabId, true));
        }
        else {
            Communication.getBus().post(new SourceCompilationEvent(tabId, false, messagesByFile));
        }
        return translated;
    }

    private Source prepareRendererRequest(TranslationResult translated) {
        var res = new Source();
        res.setSource(translated.getSource());
        return res;
    }

    private byte[] exportInternal(String tabId, UUID repositoryId, UUID fileId, String code, String format, Function<Source, byte[]> renderer) {
        long startTime = System.nanoTime();
        byte[] data;
        var translated = translateInternal(tabId, repositoryId, fileId, code);
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

    public byte[] exportPng(String tabId, UUID repositoryId, UUID fileId, String code) {
        return exportInternal(tabId, repositoryId, fileId, code, "PNG", src -> renderer.exportPng(conf.getRendererAuthToken(), src));
    }

    public byte[] exportSvg(String tabId, UUID repositoryId, UUID fileId, String code) {
        return exportInternal(tabId, repositoryId, fileId, code, "SVG", src -> renderer.exportSvg(conf.getRendererAuthToken(), src));
    }

    public byte[] exportJson(String tabId, UUID repositoryId, UUID fileId, String code) {
        return exportInternal(tabId, repositoryId, fileId, code, "SVG", src -> renderer.exportJson(conf.getRendererAuthToken(), src));
    }

    public byte[] exportDot(String tabId, UUID repositoryId, UUID fileId, String code) {
        return translateInternal(tabId, repositoryId, fileId, code).getSource().getBytes(StandardCharsets.UTF_8);
    }

}
