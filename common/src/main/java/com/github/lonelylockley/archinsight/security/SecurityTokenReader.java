package com.github.lonelylockley.archinsight.security;

import io.micronaut.http.HttpRequest;
import io.micronaut.security.token.reader.HttpHeaderTokenReader;
import io.micronaut.security.token.reader.TokenReader;
import jakarta.inject.Singleton;

@Singleton
public class SecurityTokenReader extends HttpHeaderTokenReader implements TokenReader<HttpRequest<?>> {

    protected final ApiKeyConfiguration apiKeyConfiguration;

    public SecurityTokenReader(ApiKeyConfiguration apiKeyConfiguration) {
        this.apiKeyConfiguration = apiKeyConfiguration;
    }

    @Override
    protected String getHeaderName() {
        return apiKeyConfiguration.getHeaderName();
    }

    @Override
    protected String getPrefix() {
        return apiKeyConfiguration.getPrefix();
    }

}
