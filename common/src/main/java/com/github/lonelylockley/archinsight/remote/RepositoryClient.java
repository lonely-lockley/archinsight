package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.remote.repository.*;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.http.client.annotation.Client;

import java.util.List;
import java.util.UUID;

import static io.micronaut.http.HttpHeaders.ACCEPT;
import static io.micronaut.http.HttpHeaders.CONTENT_TYPE;

@Client(id = "repository")
@Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
@Header(name = CONTENT_TYPE, value = MediaType.APPLICATION_JSON)
public interface RepositoryClient {

    @Get("/repository/list")
    List<RepositoryInfo>  listUserRepositories(@Header String authorization);

    @Post("/repository/create")
    RepositoryInfo createRepository(@Header String authorization, @Body RepositoryInfo data);

    @Patch("/repository/{repositoryId}/rename")
    RepositoryInfo renameRepository(@Header String authorization, UUID repositoryId, @Body RepositoryInfo data);

    @Get("/repository/{repositoryId}/remove")
    @Header(name = ACCEPT, value = MediaType.TEXT_PLAIN)
    UUID removeRepository(@Header String authorization, UUID repositoryId);

    @Get("/repository/{repositoryId}/listNodes")
    RepositoryNode listNodes(@Header String authorization, @Nullable @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID userId, @Nullable @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String userRole, UUID repositoryId);

    @Patch("/repository/{repositoryId}/createNode")
    RepositoryNode createNode(@Header String authorization, UUID repositoryId, @Body RepositoryNode newNode);

    @Patch("/repository/{repositoryId}/renameNode")
    RepositoryNode renameNode(@Header String authorization, UUID repositoryId, @Body RepositoryNode node);

    @Patch("/repository/{repositoryId}/moveNode")
    RepositoryNode moveNode(@Header String authorization, UUID repositoryId, @Body MoveNode move);

    @Patch("/repository/{repositoryId}/removeNode")
    List<UUID> removeNode(@Header String authorization, UUID repositoryId, UUID nodeId);

    @Get("/file/{fileId}/open")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    FileContent openFile(@Header String authorization, UUID fileId);

    @Get("/file/{repositoryId}/openAll")
    List<FileData> openAllFiles(@Header String authorization, @Nullable @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID userId, @Nullable @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String userRole, UUID repositoryId);

    @Post("/file/{fileId}/save")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    @Header(name = CONTENT_TYPE, value = MediaType.APPLICATION_JSON)
    UUID saveFile(@Header String authorization, UUID fileId, @Body FileContent fc);


}
