package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.Source;
import com.github.lonelylockley.archinsight.model.TranslatedSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.function.Function;

public class ExportSource {

    private static final Logger logger = LoggerFactory.getLogger(RenderSource.class);

    private TranslatedSource translateInternal(String code) {
        var rs = RemoteSource.getInstance();
        var src = new Source();
        src.setSource(code);
        return rs.translator.translate(src);
    }

    private byte[] exportInternal(String code, String format, Function<Source, byte[]> renderer) {
        long startTime = System.nanoTime();
        byte[] data = new byte[0];
        var res = translateInternal(code);
        if (res.getMessages() == null || res.getMessages().isEmpty()) {
            data = renderer.apply(res);
        }
        logger.info("Export to {} required {}ms",
                format,
                (System.nanoTime() - startTime) / 1000000
        );
        return data;
    }

    public byte[] exportPng(String code) {
        return exportInternal(code, "PNG", src -> RemoteSource.getInstance().renderer.exportPng(src));
    }

    public byte[] exportSvg(String code) {
        return exportInternal(code, "SVG", src -> RemoteSource.getInstance().renderer.exportSvg(src));
    }

    public byte[] exportJson(String code) {
        return exportInternal(code, "SVG", src -> RemoteSource.getInstance().renderer.exportJson(src));
    }

    public byte[] exportDot(String code) {
        return translateInternal(code).getSource().getBytes(StandardCharsets.UTF_8);
    }

}
