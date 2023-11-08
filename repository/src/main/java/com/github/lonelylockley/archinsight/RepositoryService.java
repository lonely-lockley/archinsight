package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.exceptionhandling.ServiceException;
import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;
import com.github.lonelylockley.archinsight.model.remote.repository.MoveNode;
import com.github.lonelylockley.archinsight.model.remote.repository.RepostioryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.persistence.FileMapper;
import com.github.lonelylockley.archinsight.persistence.MigratorRunner;
import com.github.lonelylockley.archinsight.persistence.RepositoryMapper;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Controller("/repository")
@Secured(SecurityRule.IS_AUTHENTICATED)
public class RepositoryService {

    private static final Logger logger = LoggerFactory.getLogger(RepositoryService.class);

    @Inject
    private Config conf;
    @Inject
    private SqlSessionFactoryBean sqlSessionFactory;

    public static void main(String[] args) {
        var ctx = Micronaut.run(new Class[] {RepositoryService.class, FileService.class}, args);
        ctx.getBean(MigratorRunner.class).run();
        logger.info("Repository server started");
    }

    @Get("/list")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<List<RepostioryInfo>> list(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            if (SecurityConstants.ROLE_ANONYMOUS.equals(ownerRole)) {
                // special case for playground
                var repo = sql.getRepositoryById(conf.getPlaygroundRepositoryId());
                return HttpResponse.ok(List.of(repo));
            }
            else {
                // for authenticated users
                var repos = sql.listByOwnerId(ownerId);
                return HttpResponse.ok(repos);
            }
        }
    }

    @Post("/create")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<RepostioryInfo> create(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, RepostioryInfo data) throws Exception {
        if (!Validations.repositoryNameLengthBetween3And50(data.getName())) {
            throw new ServiceException(new ErrorMessage("Repository name length must be between 3 and 50 symbols", HttpStatus.BAD_REQUEST));
        }
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            var id = UUID.randomUUID();
            data.setId(id);
            data.setOwnerId(ownerId);
            var timestamp = Instant.now();
            data.setCreated(timestamp);
            data.setUpdated(timestamp);
            sql.createRepository(data);
            sql.setRepositoryStructure(id, RepositoryNode.createRoot(), timestamp);
            var repo = sql.getRepositoryById(id);
            session.commit();
            return HttpResponse.ok(repo);
        }
    }

    @Patch("/{repositoryId}/rename")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<RepostioryInfo> rename(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID repositoryId, RepostioryInfo data) throws Exception {
        if (!Validations.repositoryNameLengthBetween3And50(data.getName())) {
            throw new ServiceException(new ErrorMessage("Repository name length must be between 3 and 50 symbols", HttpStatus.BAD_REQUEST));
        }
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var repositoryOwnerId = rm.getRepositoryOwnerId(repositoryId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                rm.renameRepository(repositoryId, data.getName(), Instant.now());
                var res = rm.getRepositoryById(repositoryId);
                session.commit();
                return HttpResponse.ok(res);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own repository to be renamed", HttpStatus.FORBIDDEN));
            }
        }
    }

    // this should be a @Delete, but it fails to pass the `request` parameter into method. maybe in newer versions...
    @Get("/{repositoryId}/remove")
    @Produces(MediaType.TEXT_PLAIN)
    @Measured
    public HttpResponse<UUID> remove(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID repositoryId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repositoryOwnerId = rm.getRepositoryOwnerId(repositoryId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                rm.deleteRepository(repositoryId);
                fm.deleteAllRepositoryFiles(repositoryId);
                session.commit();
                return HttpResponse.ok(repositoryId);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own repository to be removed", HttpStatus.FORBIDDEN));
            }
        }
    }

    @Get("/{repositoryId}/listNodes")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<RepositoryNode> listNodes(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole, @PathVariable UUID repositoryId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            // omit owner check for playground
            if (SecurityConstants.ROLE_ANONYMOUS.equals(ownerRole)) {
                var structure = sql.getRepositoryStructure(conf.getPlaygroundRepositoryId());
                session.commit();
                return HttpResponse.ok(structure);
            }
            else {
                var repositoryOwnerId = sql.getRepositoryOwnerId(repositoryId);
                if (Objects.equals(repositoryOwnerId, ownerId)) {
                    var structure = sql.getRepositoryStructure(repositoryId);
                    session.commit();
                    return HttpResponse.ok(structure);
                }
                else {
                    throw new ServiceException(new ErrorMessage("User does not own repository to be read", HttpStatus.FORBIDDEN));
                }
            }
        }
    }

    @Patch("/{repositoryId}/createNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<RepositoryNode> createNode(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID repositoryId, RepositoryNode newNode) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var node = fs.createNode(newNode);
                rm.setRepositoryStructure(repositoryId, fs.getRoot(), Instant.now());
                if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                    var file = fs.nodeToFile(node, ownerId, repositoryId);
                    fm.createFile(file);
                }
                session.commit();
                return HttpResponse.ok(node);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own repository to be modified", HttpStatus.FORBIDDEN));
            }
        }
    }

    @Patch("/{repositoryId}/renameNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<RepositoryNode> renameNode(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID repositoryId, RepositoryNode node) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fs.renameNode(node.getId(), node.getName());
                rm.setRepositoryStructure(repositoryId, fs.getRoot(), Instant.now());
                if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                    fm.renameFile(res.getId(), res.getName());
                }
                session.commit();
                return HttpResponse.ok(res);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own repository to be modified", HttpStatus.FORBIDDEN));
            }
        }
    }

    @Patch("/{repositoryId}/moveNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<RepositoryNode> moveNode(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID repositoryId, MoveNode move) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fs.moveNode(move.getSrc(), move.getDst());
                rm.setRepositoryStructure(repositoryId, fs.getRoot(), Instant.now());
                session.commit();
                return HttpResponse.ok(res);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own repository to be modified", HttpStatus.FORBIDDEN));
            }
        }
    }

    @Patch("/{repositoryId}/removeNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<List<UUID>> removeNode(HttpRequest<Source> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @PathVariable UUID repositoryId, UUID nodeId) throws Exception {
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fs.removeNode(nodeId);
                rm.setRepositoryStructure(repositoryId, fs.getRoot(), Instant.now());
                fm.deleteFiles(res);
                session.commit();
                return HttpResponse.ok(res);
            }
            else {
                throw new ServiceException(new ErrorMessage("User does not own repository to be modified", HttpStatus.FORBIDDEN));
            }
        }
    }

}
