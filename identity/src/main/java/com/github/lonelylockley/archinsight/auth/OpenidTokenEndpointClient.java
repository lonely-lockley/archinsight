package com.github.lonelylockley.archinsight.auth;

import com.github.lonelylockley.archinsight.Config;
import io.micronaut.context.BeanContext;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClientConfiguration;
import io.micronaut.security.oauth2.endpoint.token.request.DefaultTokenEndpointClient;
import io.micronaut.security.oauth2.endpoint.token.request.context.TokenRequestContext;
import io.micronaut.security.oauth2.endpoint.token.response.TokenResponse;
import io.micronaut.security.oauth2.grants.SecureGrantMap;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.reactivestreams.Publisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
@Replaces(DefaultTokenEndpointClient.class)
public class OpenidTokenEndpointClient extends DefaultTokenEndpointClient {

    private static final Logger logger = LoggerFactory.getLogger(OpenidTokenEndpointClient.class);

    @Inject
    private Config conf;

    /**
     * @param beanContext                The bean context
     * @param defaultClientConfiguration The default client configuration
     */
    public OpenidTokenEndpointClient(BeanContext beanContext, HttpClientConfiguration defaultClientConfiguration) {
        super(beanContext, defaultClientConfiguration);
    }

    @Override
    public <G, R extends TokenResponse> Publisher<R> sendRequest(TokenRequestContext<G, R> requestContext) {
        if (logger.isTraceEnabled()) {
            logger.trace("Sending request to token endpoint [{}]", requestContext.getEndpoint().getUrl());
        }

        if (requestContext.getGrant() instanceof SecureGrantMap grant) {
            grant.put("redirect_uri", conf.getRedirectUri());
            MutableHttpRequest<G> request = HttpRequest.POST(
                            requestContext.getEndpoint().getUrl(),
                            (G) grant
                    )
                    .contentType(requestContext.getMediaType())
                    .accept(MediaType.APPLICATION_JSON_TYPE);
            secureRequest(request, requestContext);
            return getClient(requestContext.getClientConfiguration().getName())
                    .retrieve(request, requestContext.getResponseType(), requestContext.getErrorResponseType());
        }
        else {
            throw new IllegalArgumentException("Cannot deal with grant type: " +  requestContext.getGrant().getClass().getName());
        }
    }
}
