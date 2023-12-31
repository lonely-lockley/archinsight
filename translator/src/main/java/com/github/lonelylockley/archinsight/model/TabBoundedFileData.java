package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.remote.repository.FileData;

public class TabBoundedFileData extends FileData {

    public TabBoundedFileData() {
    }

    public TabBoundedFileData(FileData fd) {
        this.setFileName(fd.getFileName());
        this.setContent(fd.getContent());
        this.setId(fd.getId());
        this.setCreated(fd.getCreated());
        this.setOwnerId(fd.getOwnerId());
        this.setRepositoryId(fd.getRepositoryId());
        this.setUpdated(fd.getUpdated());
    }

    private String tabId;

    public String getTabId() {
        return tabId;
    }

    public void setTabId(String tabId) {
        this.tabId = tabId;
    }
}
