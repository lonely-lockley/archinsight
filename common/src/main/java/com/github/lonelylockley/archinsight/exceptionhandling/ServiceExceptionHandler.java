package com.github.lonelylockley.archinsight.exceptionhandling;

import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Produces
@Singleton
@Requires(classes = { ServiceException.class, ExceptionHandler.class })
public class ServiceExceptionHandler implements ExceptionHandler<ServiceException, HttpResponse<ErrorMessage>> {

    private static final Logger logger = LoggerFactory.getLogger(ServiceExceptionHandler.class);

    @Override
    public HttpResponse<ErrorMessage> handle(HttpRequest request, ServiceException exception) {
        logger.warn("Service error intercepted", exception);
        var error = exception.getError();
        return HttpResponse.serverError(error).status(error.getStatus());
    }

}
