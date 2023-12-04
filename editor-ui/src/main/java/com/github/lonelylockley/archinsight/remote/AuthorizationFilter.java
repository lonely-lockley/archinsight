package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.security.Authentication;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
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
        if (Authentication.authenticated() && !Authentication.playgroundModeEnabled()) {
            var user = Authentication.getAuthenticatedUser();
            request.getHeaders().add(SecurityConstants.USER_ID_HEADER_NAME, user.getId().toString());
            request.getHeaders().add(SecurityConstants.USER_ROLE_HEADER_NAME, SecurityConstants.ROLE_USER);
        }
        else {
            request.getHeaders().add(SecurityConstants.USER_ID_HEADER_NAME, SecurityConstants.ANONYMOUS_USER_ID.toString());
            request.getHeaders().add(SecurityConstants.USER_ROLE_HEADER_NAME, SecurityConstants.ROLE_ANONYMOUS);
        }
        return chain.proceed(request);
    }

}
