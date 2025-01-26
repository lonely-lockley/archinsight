package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.NotificationEvent;
import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.UUID;

@Singleton
public class IdentitySource {

    private static final Logger logger = LoggerFactory.getLogger(IdentitySource.class);

    @Inject
    private IdentityClient identity;
    @Inject
    private Config conf;

    public Userdata getUserById(UUID id) {
        long startTime = System.nanoTime();
        try {
            final var userdata = identity.getUserById(conf.getIdentityAuthToken(), id);
            logger.info("User data fetch for id {} required {}ms", id, (System.nanoTime() - startTime) / 1000000);
            return userdata;
        }
        catch (Exception ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, "Could not load profile data"));
            logger.error(ex.getMessage(), ex);
            return null;
        }
    }

    public Userdata getUserBySsrSession(String ssr) {
        long startTime = System.nanoTime();
        try {
            final var userdata = identity.getUserBySsrSession(conf.getIdentityAuthToken(), ssr);
            logger.info("User data fetch for ssr {} required {}ms", ssr, (System.nanoTime() - startTime) / 1000000);
            return userdata;
        }
        catch (Exception ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, "Could not load profile data"));
            logger.error(ex.getMessage(), ex);
            return null;
        }
    }

    public Userdata getUserByEmail(String email) {
        long startTime = System.nanoTime();
        try {
            final var userdata = identity.getUserByEmail(conf.getIdentityAuthToken(), email);
            logger.info("User data fetch for email {} required {}ms", email, (System.nanoTime() - startTime) / 1000000);
            return userdata;
        }
        catch (Exception ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, "Could not load profile data"));
            logger.error(ex.getMessage(), ex);
            return null;
        }
    }

    public Map<String, Object> getJWKS() {
        long startTime = System.nanoTime();
        try {
            final var jwkData = identity.getJWKS();
            logger.info("JWKS data fetch required {}ms", (System.nanoTime() - startTime) / 1000000);
            return jwkData;
        }
        catch (Exception ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, "Could not verify oauth provider data"));
            throw ex;
        }
    }
}
