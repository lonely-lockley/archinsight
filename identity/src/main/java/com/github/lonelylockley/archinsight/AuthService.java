package com.github.lonelylockley.archinsight;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.github.lonelylockley.archinsight.model.Source;
import com.github.lonelylockley.archinsight.model.Tuple2;
import io.micronaut.http.*;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.netty.cookies.NettyCookie;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAmount;
import java.util.UUID;

@Controller("/auth")
public class AuthService {

    private static final Logger logger = LoggerFactory.getLogger(AuthService.class);

    private Config conf;
    private Keychain keychain;

    public AuthService(Keychain keychain, Config conf) {
        if (conf.getKid() == null) {
            throw new IllegalArgumentException("JWT key id (env KID) is not set. This setting is required in production mode");
        }
        this.keychain = keychain;
        this.conf = conf;
    }

    @Get("/ok")
    @Secured(SecurityRule.IS_AUTHENTICATED)
    @Produces(MediaType.TEXT_HTML)
    public HttpResponse<String> ok(HttpRequest<Source> request) throws Exception {
        var accessToken = createJWT("test", conf.getKid(), Duration.of(20, ChronoUnit.MINUTES));
        var refreshToken = createJWT("test", conf.getKid(), Duration.of(90, ChronoUnit.DAYS));
        return HttpResponse.ok(createFinalPage())
                .cookie(createCookie("access_token", accessToken, conf.getDomain()))
                .cookie(createCookie("refresh_token", refreshToken,  null))
                .cookie(clearCookie("JWT"))
                .cookie(clearCookie("OAUTH2_STATE"))
                .cookie(clearCookie("OPENID_NONCE"))
                .cookie(clearCookie("OAUTH2_PKCE"));

    }

    @Get("/fail")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.TEXT_HTML)
    public HttpResponse<String> fail(HttpRequest<Source> request) throws Exception {
        return HttpResponse.ok(createFinalPage())
                .cookie(clearCookie("JWT"))
                .cookie(clearCookie("OAUTH2_STATE"))
                .cookie(clearCookie("OPENID_NONCE"))
                .cookie(clearCookie("OAUTH2_PKCE"));
    }

    @Get("/testOk")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.TEXT_HTML)
    public HttpResponse<String> testOk(HttpRequest<Source> request) throws Exception {
        if (!conf.getDevMode()) {
            return HttpResponse.notFound();
        }
        else {
            return ok(request);
        }
    }

    private NettyCookie createCookie(String name, String value, String domain) {
        var res = new NettyCookie(name, value);
        if (domain != null) {
            res.domain(domain);
        }
        res.path("/");
        res.httpOnly(true);
        return res;
    }

    private NettyCookie clearCookie(String name) {
        var clearJWT = new NettyCookie(name, "");
        clearJWT.path("/");
        clearJWT.httpOnly(true);
        clearJWT.maxAge(0);
        return clearJWT;
    }

    private String createFinalPage() {
        /*
         * Notify parent window about login result
         * and close this window
         */
        var sb = new StringBuilder();
        sb.append("<html><header><script>");
//        sb.append("try {");
//        sb.append("window.opener.alert('test');");
//        sb.append("} catch (error) {console.error(error);}");
        sb.append("window.close();");
        sb.append("</script></header><body></body></html>");
        return sb.toString();
    }

    private String createJWT(String subject, String keyId, TemporalAmount ttl, Tuple2<String, String>... claims) {
        assert keychain.hasKID(keyId);
        var keySet = keychain.getKeySet(keyId);
        Algorithm algorithm = Algorithm.ECDSA256(keySet._1, keySet._2);
        var issuedAt = Instant.now();
        var token = JWT.create()
                .withIssuer("archinsight.org")
                .withIssuedAt(issuedAt)
                .withExpiresAt(issuedAt.plus(ttl))
                .withJWTId(UUID.randomUUID().toString())
                .withKeyId(keyId)
                .withSubject(subject);
        for (Tuple2<String, String> claim : claims) {
            token.withClaim(claim._1, claim._2);
        }
        return token.sign(algorithm);
    }

}
