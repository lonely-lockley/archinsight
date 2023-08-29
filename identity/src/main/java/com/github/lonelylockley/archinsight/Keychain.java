package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Tuple2;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Singleton
public class Keychain {
    private static final Logger logger = LoggerFactory.getLogger(Keychain.class);

    private final Map<String, Tuple2<ECPublicKey, ECPrivateKey>> keys = new HashMap<>();

    public Keychain() throws Exception {
        // load test key for dev mode ==================================================================================
        if ("true".equalsIgnoreCase(System.getenv("DEV_MODE"))) {
            var pubTestKey = loadPublicKey(this.getClass().getResourceAsStream("/test_certs/test_public.key"));
            var privTestKey = loadPrivateKey(this.getClass().getResourceAsStream("/test_certs/test_private.key"));
            keys.put("test", new Tuple2<>(pubTestKey, privTestKey));
        }
        // load production keys from jwt_certs directory ===============================================================
        var certs = Paths.get("jwt_certs");
        var keyfiles = certs.toFile().listFiles();
        if (keyfiles != null) {
            var availableKeys = Arrays.stream(keyfiles)
                                            .filter(f -> f.getName().endsWith(".key"))
                                            .map(f -> {
                                                var parts = f.getName().substring(0, f.getName().length() - 4).split("_");
                                                return new Tuple2<>(parts[0], f.getName());
                                            })
                                            .collect(Collectors.groupingBy(f -> f._1));
            availableKeys
                    .forEach((kid, files) -> {
                        assert files.size() == 2;
                        try {
                            ECPublicKey pub = loadPublicKey(new FileInputStream(certs.resolve(kid + "_public.key").toFile()));;
                            ECPrivateKey priv = loadPrivateKey(new FileInputStream(certs.resolve(kid + "_private.key").toFile()));
                            keys.put(kid, new Tuple2<>(pub, priv));
                        } catch (Exception ex) {
                            throw new RuntimeException(ex);
                        }
                    });
        }
        // =============================================================================================================
        logger.info("Loaded {} keys into keychain", keys.size());
        logger.info("Loaded keys ids: [{}]", keys.keySet().stream().collect(Collectors.joining(", ")));
    }

    private ECPublicKey loadPublicKey(InputStream in) throws Exception {
        var data = in.readAllBytes();
        X509EncodedKeySpec pubKeySpec = new X509EncodedKeySpec(data);
        KeyFactory keyFactory = KeyFactory.getInstance(KeyGenerator.ALGORITHM);
        return (ECPublicKey) keyFactory.generatePublic(pubKeySpec);
    }

    private ECPrivateKey loadPrivateKey(InputStream in) throws Exception {
        var data = in.readAllBytes();
        PKCS8EncodedKeySpec pubKeySpec = new PKCS8EncodedKeySpec(data);
        KeyFactory keyFactory = KeyFactory.getInstance(KeyGenerator.ALGORITHM);
        return (ECPrivateKey) keyFactory.generatePrivate(pubKeySpec);
    }

    public boolean hasKID(String kid) {
        return this.keys.containsKey(kid);
    }

    public Tuple2<ECPublicKey, ECPrivateKey> getKeySet(String kid) {
        return this.keys.get(kid);
    }
}
