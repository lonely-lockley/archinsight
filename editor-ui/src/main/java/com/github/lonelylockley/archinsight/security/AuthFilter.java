package com.github.lonelylockley.archinsight.security;

import com.auth0.jwk.*;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.model.Userdata;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.vaadin.flow.router.BeforeEnterEvent;
import com.vaadin.flow.router.BeforeEnterListener;
import com.vaadin.flow.server.VaadinServletRequest;
import com.vaadin.flow.server.VaadinSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.security.interfaces.ECPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.UUID;

public class AuthFilter implements BeforeEnterListener {

    private static final Logger logger = LoggerFactory.getLogger(AuthFilter.class);

    private final Config conf;
    private final RemoteSource remoteSource;
    private final JwkProvider provider;

    public AuthFilter() {
        var mc = MicronautContext.getInstance();
        this.conf = mc.getConf();
        this.remoteSource = mc.getRemoteSource();
        this.provider = getJWKS();
    }

    private JwkProvider getJWKS() {
        return new JwkProvider() {

            private final Duration ttl = Duration.ofMinutes(5);

            private Map<String, Jwk> keys = new HashMap<>();
            private Instant cacheTime = null;

            @Override
            public Jwk get(String keyId) throws JwkException {
                if (cacheTime == null || Instant.now().isAfter(cacheTime.plus(ttl))) {
                    var keyset = remoteSource.identity.getJWKS();
                    keys.clear();
                    var ks = (List<Map<String, Object>>) keyset.get("keys");
                    for (Map<String, Object> k : ks) {
                        keys.put((String) k.get("kid"), Jwk.fromValues(k));
                    }
                }
                return keys.get(keyId);
            }
        };
    }

    private boolean verifyToken(DecodedJWT decoded, String sessionId) throws Exception {
        var key = provider.get(decoded.getKeyId());
        if (key != null) {
            try {
                JWT.require(Algorithm.ECDSA256((ECPublicKey) key.getPublicKey(), null))
                        .withIssuer(conf.getDomain())
                        .withAnyOfAudience(conf.getDomain())
                        .withClaimPresence("sub")
                        .withClaim("session", sessionId)
                        .build()
                        .verify(decoded);
            }
            catch (Exception ex) {
                logger.warn("{} [user id={}]", ex.getMessage(), decoded.getSubject());
            }
            return true;
        }
        else {
            logger.warn("Authentication with non-existent key ID {} [user id={}]", decoded.getKeyId(), decoded.getSubject());
            return false;
        }
    }

    @Override
    public void beforeEnter(BeforeEnterEvent event) {
        try {
            var session = VaadinSession.getCurrent();
            if (session.getAttribute(Userdata.class) == null) {
                var request = VaadinServletRequest.getCurrent();
                var sessionId = session.getSession().getId();
                var token = Arrays.stream(request.getCookies()).filter(c -> "auth_token".equals(c.getName())).findAny();
                if (token.isPresent()) {
                    var decoded = JWT.decode(token.get().getValue());
                    if (verifyToken(decoded, sessionId)) {
                        var user = remoteSource.identity.getUser(UUID.fromString(decoded.getSubject()));
                        session.setAttribute(Userdata.class, user);
                        // change session ID to protect against session fixation and token replay
                        request.getHttpServletRequest().changeSessionId();
                    }
                }
            }
            else {
                if (logger.isDebugEnabled()) {
                    logger.debug("User already logged in with session {}", session.getSession().getId());
                }
            }
        }
        catch (Exception ex) {
            logger.error("Could not verify authentication", ex);
        }
    }
}
