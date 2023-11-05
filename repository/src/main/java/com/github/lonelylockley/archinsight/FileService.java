package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.exceptionhandling.ServiceException;
import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.persistence.FileMapper;
import com.github.lonelylockley.archinsight.persistence.RepositoryMapper;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Controller("/file")
public class FileService {

    private static final Logger logger = LoggerFactory.getLogger(FileService.class);

    private final SqlSessionFactoryBean sqlSessionFactory;

    public FileService(SqlSessionFactoryBean sqlSessionFactory) {
        this.sqlSessionFactory = sqlSessionFactory;
    }

    @Get("/{fileId}/open")
    @Produces(MediaType.TEXT_PLAIN)
    @Measured
    public HttpResponse<String> open(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID fileId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(FileMapper.class);
            var repositoryOwnerId = sql.getFileOwnerById(fileId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                var res = sql.openFile(fileId);
                session.commit();
                return HttpResponse.ok(res.getContent());
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own file to be opened", HttpStatus.FORBIDDEN));
            }
        }
    }

    @Get("/{repositoryId}/openAll")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<List<FileData>> openAll(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repositoryOwnerId = rm.getRepositoryOwnerId(repositoryId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fm.openFiles(fs.getAllFileIds(repositoryId));
                session.commit();
                return HttpResponse.ok(res);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own files to be opened", HttpStatus.FORBIDDEN));
            }
        }
    }

    @Post("/{fileId}/save")
    @Consumes(MediaType.TEXT_PLAIN)
    @Produces(MediaType.TEXT_PLAIN)
    @Measured
    public HttpResponse<UUID> save(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID fileId, String fileData) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(FileMapper.class);
            var repositoryOwnerId = sql.getFileOwnerById(fileId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                sql.saveFile(fileId, fileData);
                session.commit();
                return HttpResponse.ok(fileId);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own files to be modified", HttpStatus.FORBIDDEN));
            }
        }
    }

}
