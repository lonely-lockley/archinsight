package com.github.lonelylockley.archinsight;

import io.micronaut.http.annotation.Controller;
import io.micronaut.runtime.Micronaut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/identity")
public class IdentityService {

    private static final Logger logger = LoggerFactory.getLogger(IdentityService.class);

    public static void main(String[] args) throws Exception {
        Micronaut.run(new Class[] {IdentityService.class, AuthService.class}, args);
        logger.info("Identity server started");
    }


}
