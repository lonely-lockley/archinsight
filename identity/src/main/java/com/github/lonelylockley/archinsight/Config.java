package com.github.lonelylockley.archinsight;

import io.micronaut.context.annotation.ConfigurationProperties;
import jakarta.inject.Singleton;

@Singleton
@ConfigurationProperties("archinsight")
public class Config {
    private Boolean devMode;
    private String domain;
    private String kid;
    private String apiToken;
    private String redirectUri;
    private Boolean ghostSsrEnabled;
    private String ghostSsrSecretKey;
    private String ghostApiKey;

    public Boolean getDevMode() {
        return devMode != null && devMode;
    }

    public void setDevMode(Boolean devMode) {
        this.devMode = devMode;
    }

    public String getDomain() {
        return domain;
    }

    public String getLoginDomain() {
        return "login." + domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getKid() {
        return kid;
    }

    public void setKid(String kid) {
        this.kid = kid;
    }

    public String getApiToken() {
        return apiToken;
    }

    public void setApiToken(String apiToken) {
        this.apiToken = apiToken;
    }

    public String getRedirectUri() {
        return redirectUri;
    }

    public void setRedirectUri(String redirectUri) {
        this.redirectUri = redirectUri;
    }

    public Boolean getGhostSsrEnabled() {
        return ghostSsrEnabled;
    }

    public void setGhostSsrEnabled(Boolean ghostSsrEnabled) {
        this.ghostSsrEnabled = ghostSsrEnabled;
    }

    public String getGhostSsrSecretKey() {
        return ghostSsrSecretKey;
    }

    public void setGhostSsrSecretKey(String ghostSsrSecretKey) {
        this.ghostSsrSecretKey = ghostSsrSecretKey;
    }

    public String getGhostApiKey() {
        return ghostApiKey;
    }

    public void setGhostApiKey(String ghostApiKey) {
        this.ghostApiKey = ghostApiKey;
    }
}
