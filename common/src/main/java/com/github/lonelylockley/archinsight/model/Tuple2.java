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

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Tuple2<?, ?> tuple2)) return false;
        return Objects.equals(_1, tuple2._1) && Objects.equals(_2, tuple2._2);
    }

    @Override
    public int hashCode() {
        return Objects.hash(_1, _2);
    }
}
