package com.github.lonelylockley.archinsight;

import io.micronaut.security.authentication.AuthenticationResponse;
import io.micronaut.security.config.AuthenticationModeConfiguration;
import io.micronaut.security.oauth2.configuration.OpenIdAdditionalClaimsConfiguration;
import io.micronaut.security.oauth2.endpoint.authorization.state.State;
import io.micronaut.security.oauth2.endpoint.token.response.DefaultOpenIdAuthenticationMapper;
import io.micronaut.security.oauth2.endpoint.token.response.OpenIdClaims;
import io.micronaut.security.oauth2.endpoint.token.response.OpenIdTokenResponse;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Named("google")
@Singleton
public class GoogleAuthMapper extends DefaultOpenIdAuthenticationMapper {

    private static final Logger logger = LoggerFactory.getLogger(GoogleAuthMapper.class);

    /**
     * Default constructor.
     *
     * @param openIdAdditionalClaimsConfiguration The additional claims configuration
     * @param authenticationModeConfiguration     Authentication Mode Configuration
     */
    public GoogleAuthMapper(OpenIdAdditionalClaimsConfiguration openIdAdditionalClaimsConfiguration, AuthenticationModeConfiguration authenticationModeConfiguration) {
        super(openIdAdditionalClaimsConfiguration, authenticationModeConfiguration);
    }

    @Override
    public AuthenticationResponse createAuthenticationResponse(String providerName, OpenIdTokenResponse tokenResponse, OpenIdClaims openIdClaims, State state) {
        System.err.println("+++ Access Token: " + tokenResponse.getAccessToken());
        System.err.println("+++ Refresh Token: " + tokenResponse.getRefreshToken());
        System.err.println("+++ Token Type: " + tokenResponse.getTokenType());
        System.err.println();
        openIdClaims.getClaims().forEach((key, value) -> System.err.println(">>> " + key + " -> " + value));
        logger.info("User {} logged in", openIdClaims.getSubject());
        return super.createAuthenticationResponse(providerName, tokenResponse, openIdClaims, state);
    }
}
