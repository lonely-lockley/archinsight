package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class DeclarationContext {

    private String tabId;
    private UUID fileId;

    private String declaredId;
    private String level;
    private String location;
    private List<Declaration> declarations = new ArrayList<>();

    public String getTabId() {
        return tabId;
    }

    public void setTabId(String tabId) {
        this.tabId = tabId;
    }

    public UUID getFileId() {
        return fileId;
    }

    public void setFileId(UUID fileId) {
        this.fileId = fileId;
    }

    public String getDeclaredId() {
        return declaredId;
    }

    public void setDeclaredId(String declaredId) {
        this.declaredId = declaredId;
    }

    public String getLevel() {
        return level;
    }

    public void setLevel(String level) {
        this.level = level;
    }

    public List<Declaration> getDeclarations() {
        return declarations;
    }

    public void setDeclarations(List<Declaration> declarations) {
        this.declarations = declarations;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    @Override
    public String toString() {
        return "DeclarationContext{" +
                "tabId='" + tabId + '\'' +
                ", fileId=" + fileId +
                ", declaredId='" + declaredId + '\'' +
                ", level='" + level + '\'' +
                ", location='" + location + '\'' +
                ", declarations=" + declarations +
                '}';
    }
}
