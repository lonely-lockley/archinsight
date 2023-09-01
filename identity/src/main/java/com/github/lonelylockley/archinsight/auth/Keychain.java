package com.github.lonelylockley.archinsight.auth;

import com.nimbusds.jose.jwk.ECKey;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Singleton
public class Keychain {
    private static final Logger logger = LoggerFactory.getLogger(Keychain.class);

    private final Map<String, ECKey> keys = new HashMap<>();

    public Keychain() throws Exception {
        // load test key for dev mode ==================================================================================
        if ("true".equalsIgnoreCase(System.getenv("DEV_MODE"))) {
            var jwk = loadECKey(this.getClass().getResourceAsStream("/test_keyset/test_key.jwk"));
            keys.put(jwk.getKeyID(), jwk);
        }
        // load production keys from jwt_certs directory ===============================================================
        var sets = Paths.get("jwk_sets");
        var jwkSets = sets.toFile().listFiles();
        if (jwkSets != null) {
            Arrays.stream(jwkSets)
                .filter(f -> f.getName().endsWith(".jwk"))
                .map(f -> {
                    try {
                        var in = new FileInputStream(f);
                        return loadECKey(in);
                    }
                    catch (Exception ex) {
                        logger.error("Could not load JWK from file {}", f.getName(), ex);
                    }
                    return null;
                })
                .filter(Objects::nonNull)
                .forEach(jwk -> keys.put(jwk.getKeyID(), jwk));
        }
        // =============================================================================================================
        logger.info("Loaded {} keys into keychain", keys.size());
        logger.info("Loaded keys ids: [{}]", keys.keySet().stream().collect(Collectors.joining(", ")));
    }

    private ECKey loadECKey(InputStream in) throws Exception {
        var data = in.readAllBytes();
        return ECKey.parse(new String(data, StandardCharsets.UTF_8));
    }

    public boolean hasKID(String kid) {
        return this.keys.containsKey(kid);
    }

    public ECPublicKey getPublicKey(String kid) {
        try {
            return this.keys.get(kid).toECPublicKey();
        }
        catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    public ECPrivateKey getPrivateKey(String kid) {
        try {
            return this.keys.get(kid).toECPrivateKey();
        }
        catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    public JWKSet getJwkPublicKeys() {
        var jwks = new JWKSet();
        keys.forEach((kid, keys) -> {
            jwks.add(keys.toPublicJWK().toJSONString());
        });
        return jwks;
    }
}
