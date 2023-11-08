package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.auth.Keychain;
import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("jwks")
public class JWKSService {

    private static final Logger logger = LoggerFactory.getLogger(JWKSService.class);

    private final Keychain keychain;
    private final HttpClientAddressResolver addressResolver;

    public JWKSService(Keychain keychain, HttpClientAddressResolver addressResolver) {
        this.keychain = keychain;
        this.addressResolver = addressResolver;
    }

    @Get("/keys")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public String jwks(HttpRequest<Source> request) {
        return String.format("{\"keys\":[%s]}", String.join(",", keychain.getJwkPublicKeys().getKeys()));
    }

}
