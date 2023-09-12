package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/file")
public class FileService {

    private static final Logger logger = LoggerFactory.getLogger(FileService.class);

    private final HttpClientAddressResolver addressResolver;

    public FileService(HttpClientAddressResolver addressResolver) {
        this.addressResolver = addressResolver;
    }

    @Get("/open/{fileId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.TEXT_PLAIN)
    public String open(HttpRequest<Source> request, @PathVariable String fileId) throws Exception {
        var startTime = System.nanoTime();

        logger.info("Access: /open from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return "result";
    }

}
