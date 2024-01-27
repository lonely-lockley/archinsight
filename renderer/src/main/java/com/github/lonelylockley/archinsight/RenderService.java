package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.exceptionhandling.ServiceException;
import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
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
import java.util.List;

@Controller("/render")
@Secured(SecurityRule.IS_AUTHENTICATED)
public class RenderService {

    private static final Logger logger = LoggerFactory.getLogger(RenderService.class);

    public static void main(String[] args) {
        Micronaut.run(RenderService.class, args);
        logger.info("Render server started");
    }

    private byte[] render(HttpRequest<?> request, Source data, String outputFormat, String dpi) {
        try {
            var result = new byte[0];
            try (var renderer = new GraphvizRenderer()) {
                renderer.writeInput(data.getSource());
                result = renderer.render(outputFormat, dpi);
            }
            return result;
        }
        catch (Exception ex) {
            throw new ServiceException(new ErrorMessage("Error rendering " + outputFormat + " for tabId = " + data.getTabId()), ex);
        }
    }

    @Post()
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    @Measured
    public String renderDefault(HttpRequest<?> request, Source data) {
        return renderSVG(request, data);
    }

    @Post("/svg/batch")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public List<Source> renderSVGBatch(HttpRequest<?> request, List<Source> data) throws Exception {
        return data.stream().parallel().map(tr -> {
            var src = new String(render(request, tr, "svg", null), StandardCharsets.UTF_8);
            var res = new Source();
            res.setTabId(tr.getTabId());
            res.setSource(src);
            return res;
        }).toList();
    }

    @Post("/svg")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("image/svg+xml")
    @Measured
    public String renderSVG(HttpRequest<?> request, Source data) {
        return new String(render(request, data, "svg", null), StandardCharsets.UTF_8);
    }

    @Post("/png")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.IMAGE_PNG)
    @Measured
    public byte[] renderPNG(HttpRequest<?> request, Source data) {
        return render(request, data, "png", "200");
    }

    @Post("/json")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public byte[] renderJSON(HttpRequest<?> request, Source data) {
        return render(request, data, "json", null);
    }

}
