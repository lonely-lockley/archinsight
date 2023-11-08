package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
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
    @Inject
    private Config conf;

    public TranslatedSource render(String code) {
        long startTime = System.nanoTime();
        var src = new Source();
        src.setSource(code);
        var res = translator.translate(conf.getTranslatorAuthToken(), src);
        if (res.getMessages() == null || res.getMessages().isEmpty()) {
            res.setSource(renderer.renderSvg(conf.getRendererAuthToken(), res));
        }
        logger.info("Render required required {}ms",
                (System.nanoTime() - startTime) / 1000000
        );
        return res;
    }

}
