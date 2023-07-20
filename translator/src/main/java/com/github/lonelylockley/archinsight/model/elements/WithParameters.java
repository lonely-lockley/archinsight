package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;

public interface WithParameters extends HasType {
    public void setName(String name);
    public String getName();
    public void setDescription(String description);
    public String getDescription();
    public void setTechnology(String tech);
    public String getTechnology();
}
