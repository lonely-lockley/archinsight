package com.github.lonelylockley.archinsight.persistence;

import io.micronaut.core.annotation.NonNull;

import java.util.List;

public interface MappersRegistry {

    @NonNull
    public List<Class<?>> getMappersToRegister();

}
