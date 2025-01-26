package com.github.lonelylockley.archinsight.external;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.persistence.UserdataMapper;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.netty.DefaultHttpClient;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Stream;

@Singleton
public class ExternalSsrPlugin {

    private static final Logger logger = LoggerFactory.getLogger(ExternalSsrPlugin.class);

    private final SqlSessionFactoryBean sqlSessionFactory;
    private final ExternalSsrClient client;
    private final Config conf;
    HttpClient httpClient;

    public ExternalSsrPlugin(SqlSessionFactoryBean sqlSessionFactory, ExternalSsrClient client, Config conf, HttpClient httpClient) {
        this.sqlSessionFactory = sqlSessionFactory;
        this.client = client;
        this.conf = conf;
        this.httpClient = httpClient;
    }

    @ExecuteOn(TaskExecutors.BLOCKING)
    public List<Cookie> synchronizeWithExternalProvider(String email) {
        final var authHeader = createAuthHeader();
        var searchResult = client.searchUserByEmail(authHeader, email);
        if (searchResult == null) {
            // problem with api. external service returned 404
            throw new RuntimeException("External service returned `null` for user search request");
        }
        else
        if (searchResult.getMembers().size() > 1) {
            // we don't know which of the users will be authenticated
            throw new RuntimeException("External service returned `multiple` for user search request");
        }
        else
        if (searchResult.getMembers().isEmpty()) {
            // synchronize user to Ghost
            searchResult = createUser(email, authHeader);
        }
        // authenticate user
        return authenticate(searchResult, authHeader);
    }

    private ExternalUserData createUser(String email, String authHeader) {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(UserdataMapper.class);
            var user = sql.getByEmail(email);
            var externalUser = new ExternalUserData.ExternalUser();
            externalUser.setEmail(user.getEmail());
            externalUser.setName(user.getDisplayName());
            var data = new ExternalUserData();
            data.setMembers(Collections.singletonList(externalUser));
            return client.createExternalUser(authHeader, data);
        }
        catch (Exception ex) {
            logger.error("Error accessing user data", ex);
        }
        throw new RuntimeException("Couldn't create external user");
    }

    private List<Cookie> authenticate(ExternalUserData eud, String authHeader) {
        var user = eud.getMembers().getFirst();
        var signInResponse = client.createSignInUrl(authHeader, user.getId());
        if (signInResponse == null || signInResponse.getMember_signin_urls().isEmpty()) {
            throw new RuntimeException("External service returned zero or `null` for sign in url request");
        }
        else
        if (signInResponse.getMember_signin_urls().size() > 1) {
            // we don't know which of the users will be authenticated
            throw new RuntimeException("External service returned `multiple` for sign in url request");
        }
        var url = signInResponse.getMember_signin_urls().getFirst();
        try (var client = new DefaultHttpClient()) {
            client.getConfiguration().setFollowRedirects(false);
            var response = client.toBlocking().exchange(url.getUrl());
            Optional<Cookie> ssr = response.getCookie("ghost-members-ssr");
            ssr.ifPresent(cookie -> storeSsrSession(user, cookie.getValue()));
            Optional<Cookie> sig = response.getCookie("ghost-members-ssr.sig");
            return Stream.of(ssr, sig).filter(Optional::isPresent).map(Optional::get).toList();
        }
    }

    private void storeSsrSession(ExternalUserData.ExternalUser user, String ssr) {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(UserdataMapper.class);
            sql.storeSsrSession(ssr, user.getEmail());
            session.commit();
        }
        catch (Exception ex) {
            logger.error("Error accessing user data", ex);
        }
    }

    private String createAuthHeader() {
        var adminKeyParts = conf.getGhostApiKey().split(":");
        Algorithm algorithm = Algorithm.HMAC256(HexFormat.of().parseHex(adminKeyParts[1]));
        var issuedAt = Instant.now();
        var token = JWT.create()
                .withIssuedAt(issuedAt)
                .withExpiresAt(issuedAt.plus(Duration.of(5, ChronoUnit.MINUTES)))
                .withKeyId(adminKeyParts[0])
                .withAudience("/admin/");
        return String.format("Ghost %s", token.sign(algorithm));
    }


}
