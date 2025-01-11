package com.github.lonelylockley.archinsight.model;

import java.util.Objects;

public class Tuple3<T, K, V> {

        public final T _1;
        public final K _2;
        public final V _3;

        public Tuple3(T _1, K _2, V _3) {
            this._1 = _1;
            this._2 = _2;
            this._3 = _3;
        }

        public T _1() {
            return _1;
        }

        public K _2() {
            return _2;
        }

        public V _3() {
            return _3;
        }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Tuple3<?, ?, ?> tuple3)) return false;
        return Objects.equals(_1, tuple3._1) && Objects.equals(_2, tuple3._2) && Objects.equals(_3, tuple3._3);
    }

    @Override
    public int hashCode() {
        return Objects.hash(_1, _2, _3);
    }

}
