package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;

import java.util.List;

public interface WithChildElements extends HasType {
    public void addChild(AbstractElement child);
    public List<AbstractElement> getChildren();
}
