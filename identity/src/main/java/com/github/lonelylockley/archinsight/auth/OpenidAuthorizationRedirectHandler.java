package com.github.lonelylockley.archinsight.auth;

import com.github.lonelylockley.archinsight.Config;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.core.annotation.NonNull;
import io.micronaut.security.oauth2.endpoint.authorization.request.AuthorizationRequest;
import io.micronaut.security.oauth2.endpoint.authorization.request.DefaultAuthorizationRedirectHandler;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;

import java.util.Map;

@Singleton
@Replaces(DefaultAuthorizationRedirectHandler.class)
public class OpenidAuthorizationRedirectHandler extends DefaultAuthorizationRedirectHandler {

    @Inject
    private Config conf;

    @Override
    protected void populateRedirectUri(@NonNull AuthorizationRequest authorizationRequest,
                                                @NonNull Map<String, Object> parameters) {
        parameters.put(AuthorizationRequest.PARAMETER_REDIRECT_URI, conf.getRedirectUri());
    }
}
