package com.github.lonelylockley.archinsight.auth;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.persistence.UserdataMapper;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.security.authentication.AuthenticationResponse;
import io.micronaut.security.config.AuthenticationModeConfiguration;
import io.micronaut.security.oauth2.configuration.OpenIdAdditionalClaimsConfiguration;
import io.micronaut.security.oauth2.endpoint.authorization.state.State;
import io.micronaut.security.oauth2.endpoint.token.response.DefaultOpenIdAuthenticationMapper;
import io.micronaut.security.oauth2.endpoint.token.response.OpenIdClaims;
import io.micronaut.security.oauth2.endpoint.token.response.OpenIdTokenResponse;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import org.reactivestreams.Publisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

@Named("google")
@Singleton
@Replaces(DefaultOpenIdAuthenticationMapper.class)
public class GoogleAuthMapper extends DefaultOpenIdAuthenticationMapper {

    private static final Logger logger = LoggerFactory.getLogger(GoogleAuthMapper.class);

    private final SqlSessionFactoryBean sqlSessionFactory;

    /**
     * Default constructor.
     *
     * @param openIdAdditionalClaimsConfiguration The additional claims configuration
     * @param authenticationModeConfiguration     Authentication Mode Configuration
     */
    public GoogleAuthMapper(OpenIdAdditionalClaimsConfiguration openIdAdditionalClaimsConfiguration,
                            AuthenticationModeConfiguration authenticationModeConfiguration,
                            SqlSessionFactoryBean sqlSessionFactory) {
        super(openIdAdditionalClaimsConfiguration, authenticationModeConfiguration);
        this.sqlSessionFactory = sqlSessionFactory;
    }

    @Override
    public Publisher<AuthenticationResponse> createAuthenticationResponse(String providerName, OpenIdTokenResponse tokenResponse, OpenIdClaims openIdClaims, State state) {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(UserdataMapper.class);
            Userdata user = sql.getByEmail(openIdClaims.getEmail());
            if (user == null) {
                user = new Userdata();
                user.setId(UUID.randomUUID());
                user.setEmail(openIdClaims.getEmail());
                user.setEmailVerified(openIdClaims.isEmailVerified());
                user.setDisplayName(openIdClaims.getName());
                user.setFirstName(openIdClaims.getGivenName());
                user.setLastName(openIdClaims.getFamilyName());
                user.setOriginId(openIdClaims.getSubject());
                user.setLocale(openIdClaims.getLocale());
                user.setAvatar(openIdClaims.getPicture());
                user.setSource("google");
                sql.createUserdata(user);
                session.commit();
            }
        }
        logger.info("User {} logged in", openIdClaims.getSubject());
        return super.createAuthenticationResponse(providerName, tokenResponse, openIdClaims, state);
    }
}
