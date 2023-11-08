package com.github.lonelylockley.archinsight.model.remote.repository;

import java.util.UUID;

public class MoveNode {
    private UUID src;
    private UUID dst;

    public UUID getSrc() {
        return src;
    }

    public void setSrc(UUID src) {
        this.src = src;
    }

    public UUID getDst() {
        return dst;
    }

    public void setDst(UUID dst) {
        this.dst = dst;
    }
}
