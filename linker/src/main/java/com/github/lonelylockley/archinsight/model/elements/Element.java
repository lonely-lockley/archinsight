package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;

public interface Element extends HasType {
    public String getName();
    public String getDescription();
    public String getTechnology();
}
