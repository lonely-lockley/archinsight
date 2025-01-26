package com.github.lonelylockley.archinsight.external;

import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.http.client.annotation.Client;

import static io.micronaut.http.HttpHeaders.ACCEPT;

@Client(id = "external_ssr")
public interface ExternalSsrClient {

    @Get("/ghost/api/admin/members/?filter=email:'{email}'")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    ExternalUserData searchUserByEmail(@Header String authorization, String email);

    @Post("/ghost/api/admin/members")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    ExternalUserData createExternalUser(@Header String authorization, @Body ExternalUserData user);

    @Get("/ghost/api/admin/members/{externalId}/signin_urls/")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    SigninUrlResponse createSignInUrl(@Header String authorization, String externalId);

}

