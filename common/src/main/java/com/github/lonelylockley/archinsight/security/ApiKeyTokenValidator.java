package com.github.lonelylockley.archinsight.security;

import io.micronaut.core.async.publisher.Publishers;
import io.micronaut.http.HttpRequest;
import io.micronaut.security.authentication.Authentication;
import io.micronaut.security.token.validator.TokenValidator;
import jakarta.inject.Singleton;
import org.reactivestreams.Publisher;

@Singleton
class ApiKeyTokenValidator implements TokenValidator {

    private final ApiKeyConfiguration apiKeyConfiguration;

    ApiKeyTokenValidator(ApiKeyConfiguration apiKeyConfiguration) {
        this.apiKeyConfiguration = apiKeyConfiguration;
    }

    @Override
    public Publisher<Authentication> validateToken(String token, HttpRequest<?> request) {
        return apiKeyConfiguration.findByApiKey(token)
                .map(principal -> Authentication.build(principal._2))
                .map(Publishers::just).orElseGet(Publishers::empty);
    }

}
