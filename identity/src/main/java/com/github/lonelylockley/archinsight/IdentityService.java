package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.external.ExternalSsrPlugin;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import com.github.lonelylockley.archinsight.persistence.MigratorRunner;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.persistence.UserdataMapper;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpHeaders;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

@Controller("/identity")
public class IdentityService {

    private static final Logger logger = LoggerFactory.getLogger(IdentityService.class);

    private final HttpClientAddressResolver addressResolver;
    private final SqlSessionFactoryBean sqlSessionFactory;
    private final Config conf;

    public static void main(String[] args) throws Exception {
        var ctx = Micronaut.run(new Class[] {IdentityService.class, AuthService.class, JWKSService.class}, args);
        ctx.getBean(MigratorRunner.class).run();
        logger.info("Identity server started");
    }

    public IdentityService(HttpClientAddressResolver addressResolver, SqlSessionFactoryBean sqlSessionFactory, Config conf) {
        this.addressResolver = addressResolver;
        this.sqlSessionFactory = sqlSessionFactory;
        this.conf = conf;
    }

    @Get("/id/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Measured
    public HttpResponse<Userdata> getById(HttpRequest<TranslationRequest> request, UUID id) {
        HttpResponse<Userdata> result = HttpResponse.unauthorized();
        if (checkToken(request)) {
            try (var session = sqlSessionFactory.getSession()) {
                var sql = session.getMapper(UserdataMapper.class);
                var user = sql.getById(id);
                if (user == null) {
                    result = HttpResponse.notFound();
                }
                else {
                    result = HttpResponse.ok(user);
                }
            }
            catch (Exception ex) {
                logger.error("Error accessing user data", ex);
                result = HttpResponse.serverError();
            }
        }
        return result;
    }

    @Get("/ssr/{ssr}")
    @Produces(MediaType.APPLICATION_JSON)
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Measured
    public HttpResponse<Userdata> getBySSrSession(HttpRequest<TranslationRequest> request, String ssr) {
        HttpResponse<Userdata> result = HttpResponse.unauthorized();
        if (checkToken(request) && conf.getGhostSsrEnabled()) {
            try (var session = sqlSessionFactory.getSession()) {
                var sql = session.getMapper(UserdataMapper.class);
                var user = sql.getBySsrSession(ssr);
                if (user == null) {
                    result = HttpResponse.notFound();
                }
                else {
                    result = HttpResponse.ok(user);
                }
            }
            catch (Exception ex) {
                logger.error("Error accessing user data", ex);
                result = HttpResponse.serverError();
            }
        }
        return result;
    }

    @Get("/email/{email}")
    @Produces(MediaType.APPLICATION_JSON)
    @Secured(SecurityRule.IS_ANONYMOUS)
    @Measured
    public HttpResponse<Userdata> getByEmail(HttpRequest<TranslationRequest> request, String email) {
        HttpResponse<Userdata> result = HttpResponse.unauthorized();
        if (checkToken(request)) {
            try (var session = sqlSessionFactory.getSession()) {
                var sql = session.getMapper(UserdataMapper.class);
                var user = sql.getByEmail(email);
                if (user == null) {
                    result = HttpResponse.notFound();
                }
                else {
                    result = HttpResponse.ok(user);
                }
            }
            catch (Exception ex) {
                logger.error("Error accessing user data", ex);
                result = HttpResponse.serverError();
            }
        }
        return result;
    }

    /**
     * Token auth is auxiliary here. Service is set up to check google jwt by default in a single method
     * @todo Maybe this behavior needs to be changed
     */
    private boolean checkToken(HttpRequest<TranslationRequest> request) {
        var auth = request.getHeaders().get(HttpHeaders.AUTHORIZATION);
        // cut Bearer_ - 7 characters
        return auth != null && conf.getApiToken().equals(auth.substring(7));
    }

}
