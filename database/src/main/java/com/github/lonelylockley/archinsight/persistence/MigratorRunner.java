package com.github.lonelylockley.archinsight.persistence;

import io.micronaut.flyway.FlywayConfigurationProperties;
import io.micronaut.flyway.FlywayMigrator;
import jakarta.inject.Singleton;

import javax.sql.DataSource;

@Singleton
public class MigratorRunner {

    private final FlywayMigrator worker;
    private final FlywayConfigurationProperties props;
    private final DataSource datasource;

    public MigratorRunner(FlywayMigrator worker, FlywayConfigurationProperties props, DataSource datasource) {
        this.worker = worker;
        this.props = props;
        this.datasource = datasource;
    }

    public void run() {
        worker.run(props, datasource);
    }
}
