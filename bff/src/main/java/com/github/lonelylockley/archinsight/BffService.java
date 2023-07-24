package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import com.github.lonelylockley.archinsight.model.TranslatedSource;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Consumes;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/api/v1")
public class BffService {

    private static final Logger logger = LoggerFactory.getLogger(BffService.class);
    @Inject
    private HttpClientAddressResolver addressResolver;
    private final TranslatorClient translator;
    private final RendererClient renderer;

    public static void main(String[] args) {
        Micronaut.run(BffService.class, args);
        logger.info("BFF server started");
    }

    public BffService(TranslatorClient translator, RendererClient renderer) {
        this.translator = translator;
        this.renderer = renderer;
    }

    @Post("/render")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public TranslatedSource translate(HttpRequest<Source> request, Source data) throws Exception {
        long startTime = System.nanoTime();
        var res = translator.translate(data);
        if (res.getMessages() == null || res.getMessages().isEmpty()) {
            res.setSource(renderer.renderSvg(res));
        }
        logger.info("Access: /translate from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return res;
    }


}
