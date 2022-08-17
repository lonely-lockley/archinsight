package com.github.lonelylockley.archinsight.model;

import java.util.Objects;

public class Tuple2<T, K> {

    public final T _1;
    public final K _2;

    public Tuple2(T _1, K _2) {
        this._1 = _1;
        this._2 = _2;
    }

    public T _1() {
        return _1;
    }

    public K _2() {
        return _2;
    }

}
