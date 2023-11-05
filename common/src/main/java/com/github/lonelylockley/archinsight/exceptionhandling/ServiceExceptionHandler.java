package com.github.lonelylockley.archinsight.exceptionhandling;

import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

@Produces
@Singleton
@Requires(classes = { ServiceException.class, ExceptionHandler.class })
public class ServiceExceptionHandler implements ExceptionHandler<ServiceException, HttpResponse<ErrorMessage>> {

    @Override
    public HttpResponse<ErrorMessage> handle(HttpRequest request, ServiceException exception) {
        var error = exception.getError();
        return HttpResponse.serverError(error).status(error.getStatus());
    }

}
