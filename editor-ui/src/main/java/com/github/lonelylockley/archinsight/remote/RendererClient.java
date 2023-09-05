package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.Source;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.client.annotation.Client;

import static io.micronaut.http.HttpHeaders.ACCEPT;
import static io.micronaut.http.HttpHeaders.CONTENT_TYPE;

@Client(id = "renderer")
public interface RendererClient {

    @Post("/render/svg")
    @Header(name = ACCEPT, value = "image/svg+xml")
    String renderSvg(Source data);

    @Post("/render/svg")
    @Header(name = ACCEPT, value = "image/svg+xml")
    byte[] exportSvg(Source data);

    @Post("/render/png")
    @Header(name = ACCEPT, value = MediaType.IMAGE_PNG)
    byte[] exportPng(Source data);

    @Post("/render/json")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    byte[] exportJson(Source data);

}
