package com.github.lonelylockley.archinsight;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.github.lonelylockley.archinsight.auth.Keychain;
import com.github.lonelylockley.archinsight.external.ExternalSsrPlugin;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.persistence.UserdataMapper;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.*;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.http.netty.cookies.NettyCookie;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAmount;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Controller("/auth")
public class AuthService {

    private static final Logger logger = LoggerFactory.getLogger(AuthService.class);

    private final Config conf;
    private final Keychain keychain;
    private final SqlSessionFactoryBean sqlSessionFactory;
    private final HttpClientAddressResolver addressResolver;
    private final ExternalSsrPlugin plugin;

    public AuthService(Keychain keychain, Config conf, SqlSessionFactoryBean sqlSessionFactory, HttpClientAddressResolver addressResolver, ExternalSsrPlugin plugin) {
        if (conf.getKid() == null) {
            throw new IllegalArgumentException("JWT key id (env KID) is not set. This setting is required in production mode");
        }
        this.keychain = keychain;
        this.conf = conf;
        this.sqlSessionFactory = sqlSessionFactory;
        this.addressResolver = addressResolver;
        this.plugin = plugin;
    }

    private HttpResponse<String> onSuccess(String email, String sessionId, List<Cookie> additionalCookies) {
        UUID userId = null;
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(UserdataMapper.class);
            userId = sql.getIdByEmail(email);
        }
        catch (Exception ex) {
            logger.error("Error accessing user data", ex);
            return HttpResponse.serverError();
        }
        if (userId == null) {
            return HttpResponse.notFound("User not found");
        }
        var accessToken = createJWT(userId.toString(), conf.getKid(), Duration.of(5, ChronoUnit.MINUTES), new Tuple2<>("session", sessionId));
        var result =  HttpResponse.ok(createFinalPage())
                                    .cookie(createCookie("auth_token", accessToken, null, Duration.of(5, ChronoUnit.MINUTES)))
                                    .cookie(clearCookie("JWT"))
                                    .cookie(clearCookie("OAUTH2_STATE"))
                                    .cookie(clearCookie("OPENID_NONCE"))
                                    .cookie(clearCookie("OAUTH2_PKCE"));
        for (Cookie cookie : additionalCookies) {
            result.cookie(cookie);
        }
        return result;
    }

    @Get("/ok")
    @Secured(SecurityRule.IS_AUTHENTICATED)
    @Produces(MediaType.TEXT_HTML)
    @ExecuteOn(TaskExecutors.BLOCKING)
    @Measured
    public HttpResponse<String> ok(HttpRequest<TranslationRequest> request) throws Exception {
        var email = getEmailFromToken(request);
        if (conf.getGhostSsrEnabled()) {
            var additionalCookies = plugin.synchronizeWithExternalProvider(email);
            return onSuccess(email, getSessionId(request), additionalCookies);
        }
        else {
            return onSuccess(email, getSessionId(request), Collections.emptyList());
        }
    }

    @Get("/fail")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.TEXT_HTML)
    @Measured
    public HttpResponse<String> fail(HttpRequest<TranslationRequest> request) throws Exception {
        var result = HttpResponse.ok(createFinalPage())
                                .cookie(clearCookie("JWT"))
                                .cookie(clearCookie("OAUTH2_STATE"))
                                .cookie(clearCookie("OPENID_NONCE"))
                                .cookie(clearCookie("OAUTH2_PKCE"));
        return result;
    }

    @Get("/testOk")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.TEXT_HTML)
    @ExecuteOn(TaskExecutors.BLOCKING)
    @Measured
    public HttpResponse<String> testOk(HttpRequest<TranslationRequest> request) throws Exception {
        if (!conf.getDevMode()) {
            return HttpResponse.notFound();
        }
        else {
            var email = "y_menya@emaila.net";
            if (conf.getGhostSsrEnabled()) {
                var additionalCookies = plugin.synchronizeWithExternalProvider(email);
                return onSuccess(email, getSessionId(request), additionalCookies);
            }
            else {
                return onSuccess(email, getSessionId(request), Collections.emptyList());
            }
        }
    }

    @Get("/logout")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<String> logout(HttpRequest<TranslationRequest> request) throws Exception {
        var result = HttpResponse.ok(createFinalPage())
                .cookie(clearCookie("JSESSIONID"))
                .cookie(clearCookie("ghost-members-ssr"))
                .cookie(clearCookie("ghost-members-ssr.sig"));
        return result;
    }

    private NettyCookie createCookie(String name, String value, String domain, TemporalAmount ttl) {
        var res = new NettyCookie(name, value);
        if (domain != null) {
            res.domain(domain);
        }
        if (ttl != null) {
            res.maxAge(ttl);
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
        return """
               <html>
                 <header>
                   <script>
                     try {
                       if (window.opener && !window.opener.closed) {
                         if (window.opener.loginCallback) {
                           window.opener.loginCallback();
                         }
                         else {
                           window.opener.location.reload();
                         }
                       }
                       else {
                         console.error("No opener for this window!");
                       }
                     }
                     catch (error) {
                       console.error(error);
                     }
                     window.close();
                   </script>
                 </header>
                 <body></body>
               </html>
                """;
    }

    private String createJWT(String subject, String keyId, TemporalAmount ttl, Tuple2<String, String>... claims) {
        assert keychain.hasKID(keyId);
        Algorithm algorithm = Algorithm.ECDSA256(keychain.getPublicKey(keyId), keychain.getPrivateKey(keyId));
        var issuedAt = Instant.now();
        var token = JWT.create()
                .withIssuer(conf.getDomain())
                .withIssuedAt(issuedAt)
                .withExpiresAt(issuedAt.plus(ttl))
                .withJWTId(UUID.randomUUID().toString())
                .withKeyId(keyId)
                .withSubject(subject)
                .withAudience(conf.getDomain());
        for (Tuple2<String, String> claim : claims) {
            token.withClaim(claim._1, claim._2);
        }
        return token.sign(algorithm);
    }

    private String getEmailFromToken(HttpRequest<TranslationRequest> request) {
        var jwt = request.getCookies().get("JWT");
        return JWT.decode(jwt.getValue()).getClaim("email").asString();
    }

    private String getSessionId(HttpRequest<TranslationRequest> request) {
        var jsessionid = request.getCookies().get("JSESSIONID");
        if (jsessionid != null) {
            var pos = jsessionid.getValue().indexOf(".");
            if (pos > 0) {
                return jsessionid.getValue().substring(0, pos);
            }
            else {
                return jsessionid.getValue();
            }
        }
        return null;
    }

}
