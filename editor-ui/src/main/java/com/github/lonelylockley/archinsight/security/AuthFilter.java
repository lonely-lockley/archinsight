package com.github.lonelylockley.archinsight.security;

import com.auth0.jwk.Jwk;
import com.auth0.jwk.JwkException;
import com.auth0.jwk.JwkProvider;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.vaadin.flow.server.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.security.interfaces.ECPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

public class AuthFilter implements RequestHandler {

    private static final Logger logger = LoggerFactory.getLogger(AuthFilter.class);

    private final Config conf;
    private final RemoteSource remoteSource;
    private final JwkProvider provider;
    private final GhostSsrSignatureValidator ssrSignatureValidator;

    public AuthFilter() {
        var mc = MicronautContext.getInstance();
        this.conf = mc.getConf();
        this.remoteSource = mc.getRemoteSource();
        this.provider = getJWKS();
        if (conf.getGhostSsrEnabled()) {
            ssrSignatureValidator = new GhostSsrSignatureValidator(conf.getGhostSsrSecretKey());
        }
        else {
            ssrSignatureValidator = null;
        }
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

    private void identityJWTFlow(VaadinServletRequest request, VaadinSession session) throws Exception {
        var sessionId = session.getSession().getId();
        var token = Arrays.stream(request.getCookies()).filter(c -> "auth_token".equals(c.getName())).findFirst();
        if (token.isPresent()) {
            var decoded = JWT.decode(token.get().getValue());
            if (verifyToken(decoded, sessionId)) {
                var user = remoteSource.identity.getUserById(UUID.fromString(decoded.getSubject()));
                onSuccessfulLogin(request, session, user);
            }
        }
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
                return false;
            }
            return true;
        }
        else {
            logger.warn("Authentication with non-existent key ID {} [user id={}]", decoded.getKeyId(), decoded.getSubject());
            return false;
        }
    }

    private void ssrSignatureFlow(VaadinServletRequest request, VaadinSession session) throws Exception {
        var ssr = Arrays.stream(request.getCookies()).filter(c -> "ghost-members-ssr".equals(c.getName())).findFirst();
        var sig = Arrays.stream(request.getCookies()).filter(c -> "ghost-members-ssr.sig".equals(c.getName())).findFirst();
        if (ssr.isPresent() && sig.isPresent()) {
            var ssrString = ssr.get().getValue();
            var sigString = sig.get().getValue();
            if (ssrSignatureValidator.verify(ssrString, sigString)) {
                var user = remoteSource.identity.getUserBySsrSession(ssrString);
                onSuccessfulLogin(request, session, user);
            }
        }
    }

    private void onSuccessfulLogin(VaadinServletRequest request, VaadinSession session, Userdata user) {
        if (user == null || user.getId() == null) {
            if (logger.isWarnEnabled()) {
                logger.warn("Empty user data on successful login for session {}!", session.getSession().getId());
            }
            return;
        }
        session.setAttribute(Userdata.class, user);
        Authentication.clearAuthToken();
        // change session ID to protect against session fixation and token replay
        request.getHttpServletRequest().changeSessionId();
    }

    @Override
    public boolean handleRequest(VaadinSession session, VaadinRequest request, VaadinResponse response) throws IOException {
        session.lock();
        try {
            if (!Authentication.authenticated()) {
                if (conf.getGhostSsrEnabled()) {
                    ssrSignatureFlow((VaadinServletRequest) request, session);
                }
                else {
                    identityJWTFlow((VaadinServletRequest) request, session);
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
        finally {
            session.unlock();
        }
        return false;
    }
}
