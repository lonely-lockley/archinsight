package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.remote.RemoteSource;
import io.micronaut.context.ApplicationContext;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class MicronautContext {

    private static final Logger logger = LoggerFactory.getLogger(MicronautContext.class);

    private static MicronautContext instance = null;

    @Inject
    private Config conf;
    @Inject
    private RemoteSource remoteSource;

    private MicronautContext() {}

    public static MicronautContext getInstance() {
        if (instance == null) {
            instance = new MicronautContext();
            ApplicationContext.run("headless").registerSingleton(instance);
            logger.info("Initialized micronaut headless context");
        }
        return instance;
    }

    public Config getConf() {
        return conf;
    }

    public RemoteSource getRemoteSource() {
        return remoteSource;
    }
}
