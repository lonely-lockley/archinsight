package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.export.model.Aggregate;
import com.github.lonelylockley.archinsight.export.model.Block;
import com.github.lonelylockley.archinsight.export.model.Connection;

import java.util.List;

public interface ContextDescriptor {
    public List<Block> blocks();
    public List<Connection> connections();
    public List<Aggregate> aggregates();
}
