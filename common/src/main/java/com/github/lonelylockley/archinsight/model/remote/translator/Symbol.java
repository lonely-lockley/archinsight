package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class Symbol {

    private String id; // global id
    private String declaredId; // local id declared in source
    private String elementType;
    private Boolean external;
    private String name;
    private String technology;

    private String fileName;
    private UUID fileId;
    private String location;
    private String tabId;

    private int charPosition = 0;
    private int startIndex = 0;
    private int stopIndex = 0;
    private int line = 0;

    private List<Symbol> children = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getDeclaredId() {
        return declaredId;
    }

    public void setDeclaredId(String declaredId) {
        this.declaredId = declaredId;
    }

    public String getElementType() {
        return elementType;
    }

    public void setElementType(String elementType) {
        this.elementType = elementType;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Boolean getExternal() {
        return external;
    }

    public void setExternal(Boolean external) {
        this.external = external;
    }

    public int getCharPosition() {
        return charPosition;
    }

    public void setCharPosition(int charPosition) {
        this.charPosition = charPosition;
    }

    public int getStartIndex() {
        return startIndex;
    }

    public void setStartIndex(int startIndex) {
        this.startIndex = startIndex;
    }

    public int getStopIndex() {
        return stopIndex;
    }

    public void setStopIndex(int stopIndex) {
        this.stopIndex = stopIndex;
    }

    public int getLine() {
        return line;
    }

    public void setLine(int line) {
        this.line = line;
    }

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

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public List<Symbol> getChildren() {
        return children;
    }

    public void setChildren(List<Symbol> children) {
        this.children = children;
    }

    public String getTechnology() {
        return technology;
    }

    public void setTechnology(String technology) {
        this.technology = technology;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Symbol that = (Symbol) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public String toString() {
        return "Symbol{" +
                "id='" + id + '\'' +
                ", declaredId='" + declaredId + '\'' +
                ", elementType='" + elementType + '\'' +
                ", name='" + name + '\'' +
                ", technology='" + technology + '\'' +
                ", external=" + external +
                ", fileName='" + fileName + '\'' +
                ", fileId=" + fileId +
                ", location='" + location + '\'' +
                ", tabId='" + tabId + '\'' +
                ", charPosition=" + charPosition +
                ", startIndex=" + startIndex +
                ", stopIndex=" + stopIndex +
                ", line=" + line +
                ", children=" + children +
                '}';
    }
}
