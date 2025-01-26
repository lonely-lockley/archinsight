package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import io.micronaut.context.ApplicationContext;
import io.micronaut.runtime.Micronaut;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class RemoteSource {

    @Inject
    public RenderSource render;

    @Inject
    public IdentitySource identity;

    @Inject
    public ExportSource export;

    @Inject
    public RepositorySource repository;

    @Inject
    public TranslatorSource translator;

}
