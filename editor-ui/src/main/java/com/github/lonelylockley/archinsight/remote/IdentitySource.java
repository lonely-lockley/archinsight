package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.model.Userdata;
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

    public Userdata getUser(UUID id) {
        return identity.getUserById(conf.getIdentityAuthToken(), id);
    }

    public Userdata getUser(String email) {
        return identity.getUserByEmail(conf.getIdentityAuthToken(), email);
    }

    public Map<String, Object> getJWKS() {
        return identity.getJWKS();
    }
}
