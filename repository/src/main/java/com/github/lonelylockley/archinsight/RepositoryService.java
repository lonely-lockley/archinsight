package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.persistence.MigratorRunner;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/repository")
@Secured(SecurityRule.IS_AUTHENTICATED)
public class RepositoryService {

    private static final Logger logger = LoggerFactory.getLogger(RepositoryService.class);

    private final HttpClientAddressResolver addressResolver;

    public static void main(String[] args) {
        var ctx = Micronaut.run(new Class[] {RepositoryService.class, FileService.class}, args);
        ctx.getBean(MigratorRunner.class).run();
        logger.info("Repository server started");
    }

    public RepositoryService(HttpClientAddressResolver addressResolver) {
        this.addressResolver = addressResolver;
    }

    @Get("/list")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public String list(HttpRequest<Source> request, @Header("X-Authenticated-User") String ownerId) throws Exception {
        var startTime = System.nanoTime();

        logger.info("Access: /list from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return ownerId;
    }

    @Post("/create")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public String create(HttpRequest<Source> request, @Header("X-Authenticated-User") String ownerId, Source data) throws Exception {
        var startTime = System.nanoTime();

        logger.info("Access: /create from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return "result";
    }

    @Delete("/remove/{repositoryId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public String remove(HttpRequest<Source> request, @Header("X-Authenticated-User") String ownerId, @PathVariable String repositoryId) throws Exception {
        var startTime = System.nanoTime();

        logger.info("Access: /remove from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return "result";
    }

}
