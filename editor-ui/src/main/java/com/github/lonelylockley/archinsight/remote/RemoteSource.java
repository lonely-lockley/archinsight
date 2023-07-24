package com.github.lonelylockley.archinsight.remote;

import io.micronaut.context.ApplicationContext;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class RemoteSource {

    private static final Logger logger = LoggerFactory.getLogger(RemoteSource.class);

    private static RemoteSource instance;

    private RemoteSource() {}

    public static RemoteSource getInstance() {
        if (instance == null) {
            instance = new RemoteSource();
            ApplicationContext.run("headless").registerSingleton(instance);
            logger.info("Initialized micronaut headless context");
        }
        return instance;
    }

    @Inject
    protected TranslatorClient translator;
    @Inject
    protected RendererClient renderer;

}
