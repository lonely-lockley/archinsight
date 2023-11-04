package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.remote.repository.MoveNode;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.persistence.FileMapper;
import com.github.lonelylockley.archinsight.persistence.MigratorRunner;
import com.github.lonelylockley.archinsight.persistence.RepositoryMapper;
import com.github.lonelylockley.archinsight.persistence.SqlSessionFactoryBean;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Controller("/repository")
@Secured(SecurityRule.IS_AUTHENTICATED)
public class RepositoryService {

    private static final Logger logger = LoggerFactory.getLogger(RepositoryService.class);

    private final SqlSessionFactoryBean sqlSessionFactory;

    public static void main(String[] args) {
        var ctx = Micronaut.run(new Class[] {RepositoryService.class, FileService.class}, args);
        ctx.getBean(MigratorRunner.class).run();
        logger.info("Repository server started");
    }

    public RepositoryService(SqlSessionFactoryBean sqlSessionFactory) {
        this.sqlSessionFactory = sqlSessionFactory;
    }

    @Get("/list")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<List<RepositoryInfo>> list(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId) throws Exception {
        HttpResponse<List<RepositoryInfo>> result;
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            var repo = sql.listByOwnerId(ownerId);
            result = HttpResponse.ok(repo);
        }
        catch (Exception ex) {
            logger.error("Could not list repositories", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    @Post("/create")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.TEXT_PLAIN)
    @Measured
    public HttpResponse<UUID> create(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, RepositoryInfo data) throws Exception {
        HttpResponse<UUID> result;
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            var id = UUID.randomUUID();
            data.setId(id);
            data.setOwnerId(ownerId);
            sql.createRepository(data);
            sql.setRepositoryStructure(id, RepositoryNode.createRoot());
            session.commit();
            result = HttpResponse.ok(id);
        }
        catch (Exception ex) {
            logger.error("Could not create repository", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    // this should be a @Delete, but it fails to pass the `request` parameter into method. maybe in newer versions...
    @Get("/{repositoryId}/remove")
    @Produces(MediaType.TEXT_PLAIN)
    @Measured
    public HttpResponse<Object> remove(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId) throws Exception {
        HttpResponse<Object> result;
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            var repositoryOwnerId = sql.getRepositoryOwnerId(repositoryId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                sql.deleteRepository(repositoryId);
                session.commit();
                result = HttpResponse.ok(repositoryId);
            }
            else {
                result = HttpResponse.status(HttpStatus.FORBIDDEN).body("User does not own repository to be removed");
            }
        }
        catch (Exception ex) {
            logger.error("Could not remove repository", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    @Get("/{repositoryId}/listNodes")
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<Object> listNodes(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId) throws Exception {
        HttpResponse<Object> result;
        try (var session = sqlSessionFactory.getSession()) {
            var sql = session.getMapper(RepositoryMapper.class);
            var repositoryOwnerId = sql.getRepositoryOwnerId(repositoryId);
            if (Objects.equals(repositoryOwnerId, ownerId)) {
                var structure = sql.getRepositoryStructure(repositoryId);
                session.commit();
                result = HttpResponse.ok(structure);
            }
            else {
                result = HttpResponse.status(HttpStatus.FORBIDDEN).body("User does not own repository to be read");
            }
        }
        catch (Exception ex) {
            logger.error("Could not remove repository", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    @Patch("/{repositoryId}/createNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<Object> createNode(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId, RepositoryNode newNode) throws Exception {
        HttpResponse<Object> result;
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var node = fs.createNode(newNode);
                rm.setRepositoryStructure(repositoryId, fs.getRoot());
                if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                    var file = fs.nodeToFile(node, ownerId, repositoryId);
                    fm.createFile(file);
                }
                session.commit();
                result = HttpResponse.ok(node);
            }
            else {
                result = HttpResponse.status(HttpStatus.FORBIDDEN).body("User does not own repository to be modified");
            }
        }
        catch (Exception ex) {
            logger.error("Could not create node", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    @Patch("/{repositoryId}/renameNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<Object> renameNode(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId, RepositoryNode node) throws Exception {
        HttpResponse<Object> result;
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fs.renameNode(node.getId(), node.getName());
                rm.setRepositoryStructure(repositoryId, fs.getRoot());
                if (RepositoryNode.TYPE_FILE.equals(node.getType())) {
                    fm.renameFile(res.getId(), res.getName());
                }
                session.commit();
                result = HttpResponse.ok(res);
            }
            else {
                result = HttpResponse.status(HttpStatus.FORBIDDEN).body("User does not own repository to be modified");
            }
        }
        catch (Exception ex) {
            logger.error("Could not rename node", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    @Patch("/{repositoryId}/moveNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<Object> moveNode(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId, MoveNode move) throws Exception {
        HttpResponse<Object> result;
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fs.moveNode(move.getSrc(), move.getDst());
                rm.setRepositoryStructure(repositoryId, fs.getRoot());
                session.commit();
                result = HttpResponse.ok(res);
            }
            else {
                result = HttpResponse.status(HttpStatus.FORBIDDEN).body("User does not own repository to be modified");
            }
        }
        catch (Exception ex) {
            logger.error("Could not move node", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

    @Patch("/{repositoryId}/removeNode")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public HttpResponse<Object> removeNode(HttpRequest<Source> request, @Header("X-Authenticated-User") UUID ownerId, @PathVariable UUID repositoryId, UUID nodeId) throws Exception {
        HttpResponse<Object> result;
        try (var session = sqlSessionFactory.getSession()) {
            var rm = session.getMapper(RepositoryMapper.class);
            var fm = session.getMapper(FileMapper.class);
            var repo = rm.getRepositoryById(repositoryId);
            if (Objects.equals(repo.getOwnerId(), ownerId)) {
                var fs = new FileSystem(rm.getRepositoryStructure(repositoryId));
                var res = fs.removeNode(nodeId);
                rm.setRepositoryStructure(repositoryId, fs.getRoot());
                fm.deleteFiles(res);
                session.commit();
                result = HttpResponse.ok(res);
            }
            else {
                result = HttpResponse.status(HttpStatus.FORBIDDEN).body("User does not own repository to be modified");
            }
        }
        catch (Exception ex) {
            logger.error("Could not remove node", ex);
            result = HttpResponse.serverError();
        }
        return result;
    }

}
