package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;

public interface WithId extends HasType {
    public void setDeclaredId(String id);
    public String getDeclaredId();
}
