package com.github.lonelylockley.archinsight.persistence;

import jakarta.inject.Singleton;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;

import javax.sql.DataSource;

@Singleton
public class SqlSessionFactoryBean {

    private final SqlSessionFactory factory;

    public SqlSessionFactoryBean(DataSource datasource) {
        var transactionFactory = new JdbcTransactionFactory();
        var environment = new Environment("development", transactionFactory, datasource);
        var configuration = new Configuration(environment);
        configuration.getTypeHandlerRegistry().register(UuidTypeHandler.class);
        configuration.addMapper(RepositoryMapper.class);
        configuration.addMapper(FileMapper.class);
        configuration.setMapUnderscoreToCamelCase(true);
        this.factory = new SqlSessionFactoryBuilder().build(configuration);
    }

    public SqlSession getSession() {
        return factory.openSession(TransactionIsolationLevel.READ_COMMITTED);
    }
}
