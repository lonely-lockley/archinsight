package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.function.Function;

@Singleton
public class ExportSource {

    private static final Logger logger = LoggerFactory.getLogger(RenderSource.class);

    @Inject
    private TranslatorClient translator;
    @Inject
    private RendererClient renderer;
    @Inject
    private Config conf;

    private TranslationResult translateInternal(String code) {
        var src = new TranslationRequest();
        src.setSource(code);
        return translator.translate(conf.getTranslatorAuthToken(), src);
    }

    private byte[] exportInternal(String code, String format, Function<Source, byte[]> renderer) {
        long startTime = System.nanoTime();
        byte[] data = new byte[0];
        var res = translateInternal(code);
        if (res.getMessages() == null || res.getMessages().isEmpty()) {
            var src = new Source();
            src.setSource(res.getSource());
            data = renderer.apply(src);
        }
        logger.info("Export to {} required {}ms",
                format,
                (System.nanoTime() - startTime) / 1000000
        );
        return data;
    }

    public byte[] exportPng(String code) {
        return exportInternal(code, "PNG", src -> renderer.exportPng(conf.getRendererAuthToken(), src));
    }

    public byte[] exportSvg(String code) {
        return exportInternal(code, "SVG", src -> renderer.exportSvg(conf.getRendererAuthToken(), src));
    }

    public byte[] exportJson(String code) {
        return exportInternal(code, "SVG", src -> renderer.exportJson(conf.getRendererAuthToken(), src));
    }

    public byte[] exportDot(String code) {
        return translateInternal(code).getSource().getBytes(StandardCharsets.UTF_8);
    }

}
