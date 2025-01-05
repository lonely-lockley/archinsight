package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.Objects;
import java.util.UUID;

public class Declaration {

    private UUID id;
    private String declaredId;
    private String elementType;
    private String name;
    private Boolean external;

    private int charPosition = 0;
    private int startIndex = 0;
    private int stopIndex = 0;
    private int line = 0;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
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

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Declaration that = (Declaration) o;
        return Objects.equals(declaredId, that.declaredId);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(declaredId);
    }

    @Override
    public String toString() {
        return "Declaration{" +
                "declaredId='" + declaredId + '\'' +
                ", elementType='" + elementType + '\'' +
                ", name='" + name + '\'' +
                ", external=" + external +
                ", charPosition=" + charPosition +
                ", startIndex=" + startIndex +
                ", stopIndex=" + stopIndex +
                ", line=" + line +
                '}';
    }
}
