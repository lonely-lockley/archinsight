package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.*;

public class DeclarationContext {

    private String tabId;
    private UUID fileId;

    private String declaredId;
    private String level;
    private String location;
    private Set<Declaration> declarations = new HashSet<>();

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

    public Set<Declaration> getDeclarations() {
        return declarations;
    }

    public void setDeclarations(Set<Declaration> declarations) {
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
