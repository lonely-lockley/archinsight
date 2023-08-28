package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.*;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.netty.cookies.NettyCookie;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import io.micronaut.security.utils.SecurityService;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller("/auth")
@Requires(classes = SecurityService.class)
public class IdentityService {

    private static final Logger logger = LoggerFactory.getLogger(IdentityService.class);

    @Inject
    SecurityService securityService;

    public static void main(String[] args) {
        Micronaut.run(IdentityService.class, args);
        logger.info("Identity server started");
    }

    @Get("/ok")
    @Secured(SecurityRule.IS_AUTHENTICATED)
    @Produces(MediaType.TEXT_HTML)
    public HttpResponse<String> ok(HttpRequest<Source> request) throws Exception {
        // jwt validate
        // remove openid cookie
        // add own tokens
        System.out.println(">>>> " + request.getCookies().get("JSESSIONID"));
        // send redirect

        return HttpResponse.ok(createFinalPage())
                .cookie(createTestCookie("Success"))
                .cookie(clearJWTCookie())
                .cookie(clearOauthStateCookie())
                .cookie(clearNonceCookie())
                .cookie(clearPkceCookie());

    }

    @Get("/fail")
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Produces(MediaType.TEXT_HTML)
    public HttpResponse<String> fail(HttpRequest<Source> request) throws Exception {
        return HttpResponse.ok(createFinalPage())
                .cookie(createTestCookie("Fail"))
                .cookie(clearJWTCookie())
                .cookie(clearOauthStateCookie())
                .cookie(clearNonceCookie())
                .cookie(clearPkceCookie());
    }

    private NettyCookie createTestCookie(String result) {
        var res = new NettyCookie("TEST", result + "-" + System.currentTimeMillis());
        res.maxAge(3000);
        res.path("/");
        res.httpOnly(true);
        return res;
    }

    private NettyCookie clearJWTCookie() {
        var clearJWT = new NettyCookie("JWT", "");
        clearJWT.path("/");
        clearJWT.httpOnly(true);
        clearJWT.maxAge(0);
        return clearJWT;
    }

    private NettyCookie clearOauthStateCookie() {
        var clearState = new NettyCookie("OAUTH2_STATE", "");
        clearState.path("/");
        clearState.httpOnly(true);
        clearState.maxAge(0);
        return clearState;
    }

    private NettyCookie clearNonceCookie() {
        var clearNONCE = new NettyCookie("OPENID_NONCE", "");
        clearNONCE.path("/");
        clearNONCE.httpOnly(true);
        clearNONCE.maxAge(0);
        return clearNONCE;
    }

    private NettyCookie clearPkceCookie() {
        var clearPKCE = new NettyCookie("OAUTH2_PKCE", "");
        clearPKCE.path("/");
        clearPKCE.httpOnly(true);
        clearPKCE.maxAge(0);
        return clearPKCE;
    }

    private String createFinalPage() {
        /*
         * Notify parent window about login result
         * and close this window
         */
        var sb = new StringBuilder();
        sb.append("<html><header><script>");
//        sb.append("try {");
//        sb.append("window.opener.alert('test');");
//        sb.append("} catch (error) {console.error(error);}");
        sb.append("window.close();");
        sb.append("</script></header><body></body></html>");
        return sb.toString();
    }

}
