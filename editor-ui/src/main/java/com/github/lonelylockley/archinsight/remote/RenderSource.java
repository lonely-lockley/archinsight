package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatedSource;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RenderSource {

    private static final Logger logger = LoggerFactory.getLogger(RenderSource.class);

    @Inject
    private TranslatorClient translator;
    @Inject
    private RendererClient renderer;

    public TranslatedSource render(String code) {
        long startTime = System.nanoTime();
        var src = new Source();
        src.setSource(code);
        var res = translator.translate(src);
        if (res.getMessages() == null || res.getMessages().isEmpty()) {
            res.setSource(renderer.renderSvg(res));
        }
        logger.info("Render required required {}ms",
                (System.nanoTime() - startTime) / 1000000
        );
        return res;
    }

}
