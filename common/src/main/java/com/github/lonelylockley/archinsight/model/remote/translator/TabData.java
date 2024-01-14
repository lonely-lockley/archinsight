package com.github.lonelylockley.archinsight.model.remote.translator;

import java.io.Serializable;
import java.util.UUID;

public class TabData implements Serializable {
    private String fileName;
    private UUID fileId;
    private String tabId;
    private String source;

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public UUID getFileId() {
        return fileId;
    }

    public void setFileId(UUID fileId) {
        this.fileId = fileId;
    }

    public String getTabId() {
        return tabId;
    }

    public void setTabId(String tabId) {
        this.tabId = tabId;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }
}
