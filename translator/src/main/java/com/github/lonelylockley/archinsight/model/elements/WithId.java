package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;

public interface WithId extends HasType {
    public void setId(String id);
    public String getId();
}
