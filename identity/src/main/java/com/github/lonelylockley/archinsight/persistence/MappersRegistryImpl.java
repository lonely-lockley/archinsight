package com.github.lonelylockley.archinsight.persistence;

import jakarta.inject.Singleton;

import java.util.List;

@Singleton
public class MappersRegistryImpl implements MappersRegistry {
    @Override
    public List<Class<?>> getMappersToRegister() {
        return List.of(UserdataMapper.class);
    }
}
