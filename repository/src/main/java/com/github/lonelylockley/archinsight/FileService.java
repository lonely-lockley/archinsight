package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.exceptionhandling.ServiceException;
import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import com.github.lonelylockley.archinsight.model.remote.repository.FileContent;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.persistence.FileMapper;
import com.github.lonelylockley.archinsight.persistence.RepositoryMapper;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.*;

@Controller("/file")
@Secured(SecurityRule.IS_AUTHENTICATED)
public class FileService {

    private static final Logger logger = LoggerFactory.getLogger(FileService.class);

    @Inject
    private Config conf;
    @Inject
    private SqlSessionFactoryBean sqlSessionFactory;

    @Get("/{fileId}/open")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<FileContent> open(HttpRequest<?> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole, @PathVariable UUID fileId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(FileMapper.class);
            // omit owner check for playground
            if (SecurityConstants.ROLE_ANONYMOUS.equals(ownerRole)) {
                // to prevent any file opening by anonymous user we lock user in playground repository
                var res = sql.openFileInRepository(conf.getPlaygroundRepositoryId(), fileId);
                session.commit();
                return HttpResponse.ok(new FileContent(res.getContent()));
            }
            else {
                var repositoryAndOwner = sql.getFileOwnerAndRepositoryById(fileId);
                if (Objects.equals(repositoryAndOwner.getOwnerId(), ownerId)) {
                    var res = sql.openFile(fileId);
                    session.commit();
                    return HttpResponse.ok(new FileContent(res.getContent()));
                }
                else {
                    throw new ServiceException(new ErrorMessage("User does not own file to be opened", HttpStatus.FORBIDDEN));
                }
            }
        }
    }

    @Get("/{repositoryId}/openAll")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<List<FileData>> openAll(HttpRequest<?> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole, @PathVariable UUID repositoryId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            // omit owner check for playground
            if (SecurityConstants.ROLE_ANONYMOUS.equals(ownerRole)) {
                // to prevent any file opening by anonymous user we lock user in playground repository
                var fs = new FileSystem(rm.getRepositoryStructure(conf.getPlaygroundRepositoryId()));
                var ids = fs.getAllFileIds(conf.getPlaygroundRepositoryId());
                if (ids.isEmpty()) {
                    return HttpResponse.ok(Collections.emptyList());
                }
                else {
                    var res = fm.openFiles(ids);
                    session.commit();
                    return HttpResponse.ok(res);
                }
            }
            else {
                var repositoryOwnerId = rm.getRepositoryOwnerId(repositoryId);
                if (Objects.equals(repositoryOwnerId, ownerId)) {
                    var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                    var ids = fs.getAllFileIds(repositoryId);
                    if (ids.isEmpty()) {
                        return HttpResponse.ok(Collections.emptyList());
                    }
                    else {
                        var res = fm.openFiles(ids);
                        session.commit();
                        return HttpResponse.ok(res);
                    }
                }
                else {
                    throw new ServiceException(new ErrorMessage("User does not own files to be opened", HttpStatus.FORBIDDEN));
                }
            }
        }
    }

    @Post("/{fileId}/save")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<UUID> save(HttpRequest<?> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID fileId, @Body FileContent fc) throws Exception {
        if (!Validations.fileContentLengthIsUnder1MB(fc.getContent())) {
            throw new ServiceException(new ErrorMessage("The file is too large", HttpStatus.BAD_REQUEST));
        }
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repositoryAndOwner = fm.getFileOwnerAndRepositoryById(fileId);
            if (Objects.equals(repositoryAndOwner.getOwnerId(), ownerId)) {
                var timestamp = Instant.now();
                fm.saveFile(fileId, fc.getContent(), timestamp);
                rm.touchRepository(repositoryAndOwner.getRepositoryId(), timestamp);
                session.commit();
                return HttpResponse.ok(fileId);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own files to be modified", HttpStatus.FORBIDDEN));
            }
        }
    }

}
