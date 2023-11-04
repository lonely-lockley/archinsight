package com.github.lonelylockley.archinsight.tracing;

import io.micronaut.aop.InterceptorBean;
import io.micronaut.aop.MethodInterceptor;
import io.micronaut.aop.MethodInvocationContext;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
@InterceptorBean(Measured.class)
public class ResponseTimeMeasuringInterceptor implements MethodInterceptor<Object, Object> {

    private static final Logger logger = LoggerFactory.getLogger(ResponseTimeMeasuringInterceptor.class);

    @Inject
    private HttpClientAddressResolver addressResolver;

    @Override
    public Object intercept(MethodInvocationContext<Object, Object> context) {
        var startTime = System.nanoTime();
        var request = (HttpRequest) context.getParameterValueMap().get("request");
        var res = context.proceed();
        if (request != null) {
            logger.info("Access: {} from {} required {}ms",
                    request.getPath(),
                    addressResolver.resolve(request),
                    (System.nanoTime() - startTime) / 1000000
            );
        }
        else {
            logger.warn("Access: {}.{} required {}ms",
                    context.getDeclaringType().getSimpleName(),
                    context.getMethodName(),
                    (System.nanoTime() - startTime) / 1000000
            );
        }
        return res;
    }
}
