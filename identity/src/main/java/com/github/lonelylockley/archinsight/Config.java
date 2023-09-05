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
}
