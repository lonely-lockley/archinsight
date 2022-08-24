package archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/repository")
public class RepositoryService {

    private static final Logger logger = LoggerFactory.getLogger(RepositoryService.class);

    public static void main(String[] args) {
        Micronaut.run(RepositoryService.class, args);
        logger.info("Repository server started");
    }

    private final HttpClientAddressResolver addressResolver;

    public RepositoryService(HttpClientAddressResolver addressResolver) {
        this.addressResolver = addressResolver;
    }

    @Post("/list")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public String list(HttpRequest<Source> request, Source data) throws Exception {
        var startTime = System.nanoTime();

        logger.info("Access: /list from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return "result";
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
