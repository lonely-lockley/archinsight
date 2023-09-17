package com.github.lonelylockley.archinsight.model;

import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.joran.JoranConfigurator;
import ch.qos.logback.core.joran.spi.JoranException;
import ch.qos.logback.core.util.StatusPrinter;
import io.micronaut.context.ApplicationContext;
import io.micronaut.context.env.Environment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.File;

public class LoggingConfigReader {

    private static final Logger logger = LoggerFactory.getLogger(LoggingConfigReader.class);

    private String logbackExternalConfigPath;

    public LoggingConfigReader() {
        ApplicationContext applicationContext = ApplicationContext.run();
        Environment environment = applicationContext.getEnvironment();
        this.logbackExternalConfigPath = environment.getProperty("archinsight.config", String.class, "/default/path");
    }

    public void initLoggerConfig() {
        // assume SLF4J is bound to logback in the current environment
        LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
        JoranConfigurator configurator = new JoranConfigurator();
        File configFile = new File(logbackExternalConfigPath.trim());
        configurator.setContext(context);

        // Call context.reset() to clear any previous configuration, e.g. default
        // configuration. For multi-step configuration, omit calling context.reset().
        if (configFile.isFile() && configFile.length() != 0){
            context.reset();
            logger.info("Loading external logback config: " + logbackExternalConfigPath);
            try {
                configurator.doConfigure(logbackExternalConfigPath);
            } catch (JoranException e) {
                throw new RuntimeException(e);
            }
        }
        StatusPrinter.printInCaseOfErrorsOrWarnings(context);
    }
}
