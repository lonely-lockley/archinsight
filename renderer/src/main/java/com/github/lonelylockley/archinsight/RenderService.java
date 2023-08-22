package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Consumes;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;

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

    private byte[] render(HttpRequest<Source> request, Source data, String outputFormat, String dpi) throws Exception {
        var startTime = System.nanoTime();
        var result = new byte[0];
        try (var renderer = new GraphvizRenderer()) {
            renderer.writeInput(data.getSource());
            result = renderer.render(outputFormat, dpi);
        }
        logger.info("Access: /render/{} from {} required {}ms",
                outputFormat,
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return result;
    }

    @Post()
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    public String renderDefault(HttpRequest<Source> request, Source data) throws Exception {
        return renderSVG(request, data);
    }

    @Post("/svg")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    public String renderSVG(HttpRequest<Source> request, Source data) throws Exception {
        return new String(render(request, data, "svg", null), StandardCharsets.UTF_8);
    }

    @Post("/png")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.IMAGE_PNG)
    public byte[] renderPNG(HttpRequest<Source> request, Source data) throws Exception {
        return render(request, data, "png", "200");
    }

    @Post("/json")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public byte[] renderJSON(HttpRequest<Source> request, Source data) throws Exception {
        return render(request, data, "json", null);
    }

}
