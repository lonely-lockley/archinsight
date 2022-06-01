package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Consumes;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/render")
public class RenderService {

    private static final Logger logger = LoggerFactory.getLogger(RenderService.class);

    public static void main(String[] args) {
        Micronaut.run(RenderService.class, args);
        logger.info("Render server started");
    }

    private final HttpClientAddressResolver addressResolver;

    public RenderService(HttpClientAddressResolver addressResolver) {
        this.addressResolver = addressResolver;
    }

    @Post
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    public String compile(HttpRequest<Source> request, Source data) throws Exception {
        var startTime = System.nanoTime();
        var renderer = new GraphvizRenderer();
        renderer.writeInput(data.source);
        var result = renderer.render();
        renderer.cleanup();
        logger.info("Access: /render from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return result;
    }

}
