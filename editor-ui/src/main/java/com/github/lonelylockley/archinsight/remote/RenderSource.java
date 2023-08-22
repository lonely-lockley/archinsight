package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.Source;
import com.github.lonelylockley.archinsight.model.TranslatedSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RenderSource {

    private static final Logger logger = LoggerFactory.getLogger(RenderSource.class);

    public TranslatedSource render(String code) {
        var rs = RemoteSource.getInstance();
        long startTime = System.nanoTime();
        var src = new Source();
        src.setSource(code);
        var res = rs.translator.translate(src);
        if (res.getMessages() == null || res.getMessages().isEmpty()) {
            res.setSource(rs.renderer.renderSvg(res));
        }
        logger.info("Render required required {}ms",
                (System.nanoTime() - startTime) / 1000000
        );
        return res;
    }

}
