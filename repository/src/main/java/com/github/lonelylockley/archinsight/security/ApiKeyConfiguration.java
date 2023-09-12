package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.Tuple2;
import io.micronaut.context.annotation.ConfigurationProperties;
import io.micronaut.http.HttpHeaderValues;
import io.micronaut.http.HttpHeaders;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@ConfigurationProperties("micronaut.security")
public class ApiKeyConfiguration {

    private String headerName = HttpHeaders.AUTHORIZATION;
    private String prefix = HttpHeaderValues.AUTHORIZATION_PREFIX_BEARER;

    private Map<String, String> apiKeys = new HashMap<>();

    public Map<String, String> getApiKeys() {
        return apiKeys;
    }

    public void setApiKeys(Map<String, String> apiKeys) {
        this.apiKeys.clear();
        apiKeys.forEach((k ,v) -> this.apiKeys.put(v, k));
    }

    public String getHeaderName() {
        return headerName;
    }

    public String getPrefix() {
        return prefix;
    }

    public Optional<Tuple2<String, String>> findByApiKey(String key) {
        return Optional.ofNullable(apiKeys.get(key)).map(principal -> new Tuple2<>(key, principal));
    }
}
