package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.persistence.MigratorRunner;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/identity")
public class IdentityService {

    private static final Logger logger = LoggerFactory.getLogger(IdentityService.class);

    private final HttpClientAddressResolver addressResolver;

    public static void main(String[] args) throws Exception {
        var ctx = Micronaut.run(new Class[] {IdentityService.class, AuthService.class, JWKSService.class}, args);
        ctx.getBean(MigratorRunner.class).run();
        logger.info("Identity server started");
    }

    public IdentityService(HttpClientAddressResolver addressResolver) {
        this.addressResolver = addressResolver;
    }

}
