package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.client.annotation.Client;

import java.util.Map;
import java.util.UUID;

import static io.micronaut.http.HttpHeaders.ACCEPT;

@Client(id = "identity")
public interface IdentityClient {

    @Get("/identity/id/{id}")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    Userdata getUserById(@Header String authorization, UUID id);

    @Get("/identity/email/{email}")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    Userdata getUserByEmail(@Header String authorization, String email);

    @Get("/jwks/keys")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    Map<String, Object> getJWKS();

}
