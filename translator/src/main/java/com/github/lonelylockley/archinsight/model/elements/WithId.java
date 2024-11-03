package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.parse.HasType;

public interface WithId extends HasType {
    public void setDeclaredId(DynamicId id);
    public DynamicId getDeclaredId();
}
