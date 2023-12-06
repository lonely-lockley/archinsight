package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

public class RenderSource {

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

    private Source prepareRendererRequest(TranslationResult translated) {
        var res = new Source();
        res.setSource(translated.getSource());
        return res;
    }

    public Map<UUID, List<TranslatorMessage>> render(String code, UUID repositoryId, UUID fileId) {
        if (code == null || code.isBlank()) {
            Communication.getBus().post(new SourceCompilationEvent(false));
        }
        else {
            long startTime = System.nanoTime();
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
                var svg = renderer.renderSvg(conf.getRendererAuthToken(), prepareRendererRequest(translated));
                Communication.getBus().post(new SourceCompilationEvent(true));
                Communication.getBus().post(new SvgDataEvent(svg));
            }
            else {
                Communication.getBus().post(new SourceCompilationEvent(false, messagesByFile));
            }
            logger.info("Render for {} required {}ms", fileId, (System.nanoTime() - startTime) / 1000000);

            return messagesByFile;
        }
        return Collections.emptyMap();
    }

}
