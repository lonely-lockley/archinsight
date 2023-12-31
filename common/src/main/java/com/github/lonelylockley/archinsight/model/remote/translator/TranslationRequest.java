package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

public class TranslationRequest {
    private List<TabData> tabs = Collections.emptyList();
    private UUID repositoryId;
    private String tabId;

    public List<TabData> getTabs() {
        return tabs;
    }

    public void setTabs(List<TabData> tabs) {
        this.tabs = tabs;
    }

    public UUID getRepositoryId() {
        return repositoryId;
    }

    public void setRepositoryId(UUID repositoryId) {
        this.repositoryId = repositoryId;
    }

    public String getTabId() {
        return tabId;
    }

    public void setTabId(String tabId) {
        this.tabId = tabId;
    }
}
