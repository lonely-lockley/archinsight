package com.github.lonelylockley.archinsight;

import io.micronaut.context.annotation.ConfigurationProperties;
import jakarta.inject.Singleton;

@Singleton
@ConfigurationProperties("archinsight")
public class Config {

    private Boolean devMode;
    private String domain;
    private String loginUrl;
    private String identityAuthToken;
    private String translatorAuthToken;
    private String rendererAuthToken;
    private String repositoryAuthToken;
    private String contextPath;
    private Boolean siteEnabled;
    private Boolean ghostSsrEnabled;
    private String ghostSsrSecretKey;

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

    public String getTranslatorAuthToken() {
        return String.format("Bearer %s", translatorAuthToken);
    }

    public void setTranslatorAuthToken(String translatorAuthToken) {
        this.translatorAuthToken = translatorAuthToken;
    }

    public String getRendererAuthToken() {
        return String.format("Bearer %s", rendererAuthToken);
    }

    public void setRendererAuthToken(String rendererAuthToken) {
        this.rendererAuthToken = rendererAuthToken;
    }

    public String getRepositoryAuthToken() {
        return String.format("Bearer %s", repositoryAuthToken);
    }

    public void setRepositoryAuthToken(String repositoryAuthToken) {
        this.repositoryAuthToken = repositoryAuthToken;
    }

    public String getContextPath() {
        return contextPath;
    }

    public void setContextPath(String contextPath) {
        this.contextPath = contextPath;
    }

    public Boolean getSiteEnabled() {
        return siteEnabled;
    }

    public void setSiteEnabled(Boolean siteEnabled) {
        this.siteEnabled = siteEnabled;
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
}
