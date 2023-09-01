package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.auth.JWKSet;
import com.github.lonelylockley.archinsight.auth.Keychain;
import com.github.lonelylockley.archinsight.model.Source;
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

import java.util.stream.Collectors;

@Controller("jwks")
public class JWKSService {

    private static final Logger logger = LoggerFactory.getLogger(JWKSService.class);

    private final Keychain keychain;
    private final Config conf;
    private final HttpClientAddressResolver addressResolver;

    public JWKSService(Keychain keychain, Config conf, HttpClientAddressResolver addressResolver) {
        this.keychain = keychain;
        this.conf = conf;
        this.addressResolver = addressResolver;
    }

    @Get("/keys")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.TEXT_JSON)
    public String jwks(HttpRequest<Source> request) {
        var startTime = System.nanoTime();
        // cut Bearer_ - 7 characters
//        var auth = request.getHeaders().get(HttpHeaders.AUTHORIZATION);
//        if (auth != null && conf.getApiToken().equals(auth.substring(7))) {
//            return HttpResponse.ok(keychain.getJwkPublicKeys());
//        }
//        else {
//            return HttpResponse.unauthorized();
//        }
        var result = String.format("{\"keys\":[%s]}", String.join(",", keychain.getJwkPublicKeys().getKeys()));
        logger.info("Access: /jwks/keys from {} required {}ms",
                addressResolver.resolve(request),
                (System.nanoTime() - startTime) / 1000000
        );
        return result;
    }

}
