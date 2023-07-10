package com.github.lonelylockley.archinsight.translate;

import java.util.List;

public interface ContextDescriptor {
    public List<Block> blocks();
    public List<Connection> connections();
    public List<Aggregate> aggregates();
}
