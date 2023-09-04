package com.github.lonelylockley.archinsight;

import io.micronaut.context.annotation.ConfigurationProperties;
import io.micronaut.http.client.ServiceHttpClientConfiguration;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;

@Singleton
@ConfigurationProperties("archinsight")
public class Config {

    private Boolean devMode;
    private String domain;
    private String loginUrl;
    private String identityAuthToken;

    public Boolean getDevMode() {
        return devMode != null && devMode;
    }

    public void setDevMode(Boolean devMode) {
        this.devMode = devMode;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getLoginUrl() {
        return loginUrl;
    }

    public void setLoginUrl(String loginUrl) {
        this.loginUrl = loginUrl;
    }

    public String getIdentityAuthToken() {
        return String.format("Bearer %s", identityAuthToken);
    }

    public void setIdentityAuthToken(String identityAuthToken) {
        this.identityAuthToken = identityAuthToken;
    }

}
