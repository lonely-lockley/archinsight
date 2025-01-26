package com.github.lonelylockley.archinsight.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

public class GhostSsrSignatureValidator {

    private final SecretKeySpec secretKeySpec;

    public GhostSsrSignatureValidator(String secret_key) {
        this.secretKeySpec = new SecretKeySpec(secret_key.getBytes(StandardCharsets.UTF_8), "HmacSHA1");
    }

    public boolean verify(String uuid, String signature) throws Exception {
        Mac sha1_HMAC = Mac.getInstance("HmacSHA1");
        sha1_HMAC.init(secretKeySpec);
        var calculated = sha1_HMAC.doFinal(String.format("ghost-members-ssr=%s", uuid).getBytes(StandardCharsets.UTF_8));
        var encoded = Base64.getEncoder().withoutPadding().encodeToString(calculated).replaceAll("/", "_");
        return Objects.equals(signature, encoded);
    }
}
