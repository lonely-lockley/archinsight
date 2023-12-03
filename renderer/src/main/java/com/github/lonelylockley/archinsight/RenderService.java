package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Consumes;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;

@Controller("/render")
@Secured(SecurityRule.IS_AUTHENTICATED)
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

    private byte[] render(HttpRequest<Source> request, Source data, String outputFormat, String dpi) throws Exception {
        var result = new byte[0];
        try (var renderer = new GraphvizRenderer()) {
            renderer.writeInput(data.getSource());
            result = renderer.render(outputFormat, dpi);
        }
        return result;
    }

    @Post()
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    @Measured
    public String renderDefault(HttpRequest<Source> request, Source data) throws Exception {
        return renderSVG(request, data);
    }

    @Post("/svg")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    @Measured
    public String renderSVG(HttpRequest<Source> request, Source data) throws Exception {
        return new String(render(request, data, "svg", null), StandardCharsets.UTF_8);
    }

    @Post("/png")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.IMAGE_PNG)
    @Measured
    public byte[] renderPNG(HttpRequest<Source> request, Source data) throws Exception {
        return render(request, data, "png", "200");
    }

    @Post("/json")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public byte[] renderJSON(HttpRequest<Source> request, Source data) throws Exception {
        return render(request, data, "json", null);
    }

}
