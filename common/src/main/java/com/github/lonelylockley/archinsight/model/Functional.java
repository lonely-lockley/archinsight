package com.github.lonelylockley.archinsight.model;

import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

public interface Functional<P, T> {

    default Functional<P, T> noop() {
        return new Functional<P, T>() {
            @Override
            public Functional<P, T> filter(Predicate<T> predicate) {
                return this;
            }

            @Override
            public <R> R mapOrElse(Function<P, R> lambda, Supplier<R> defaultValue) {
                return defaultValue.get();
            }

            @Override
            public void foreach(Consumer<P> lambda) {
            }
        };
    }

    default Functional<P, T> capture(T param) {
        return new Functional<P, T>() {
            @Override
            public Functional<P, T> filter(Predicate<T> predicate) {
                if (predicate.test(param)) {
                    return this;
                }
                else {
                    return noop();
                }
            }

            @Override
            public <R> R mapOrElse(Function<P, R> lambda, Supplier<R> defaultValue) {
                return lambda.apply((P) param);
            }

            @Override
            public void foreach(Consumer<P> lambda) {
                lambda.accept((P) param);
            }
        };
    }

    default Functional<P, T> filter(Predicate<T> predicate) {
        throw new RuntimeException("Not implemented");
    }

    default <R> R mapOrElse(Function<P, R> lambda, Supplier<R> defaultValue) {
        throw new RuntimeException("Not implemented");
    }

    default void foreach(Consumer<P> lambda) {
        throw new RuntimeException("Not implemented");
    }
}
