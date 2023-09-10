package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.security.Authentication;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.annotation.Filter;
import io.micronaut.http.filter.ClientFilterChain;
import io.micronaut.http.filter.HttpClientFilter;
import org.reactivestreams.Publisher;

@Filter("/**")
public class AuthorizationFilter implements HttpClientFilter {

    @Override
    public Publisher<? extends HttpResponse<?>> doFilter(MutableHttpRequest<?> request, ClientFilterChain chain) {
        if (Authentication.authenticated()) {
            var user = Authentication.getAuthenticatedUser();
            request.getHeaders().add("X-Authenticated-User", user.getId().toString());
            request.getHeaders().add("X-Authenticated-User-Role", "user");
        }
        return chain.proceed(request);
    }

}
