package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.remote.renderer.Source;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.client.annotation.Client;

import java.util.List;

import static io.micronaut.http.HttpHeaders.ACCEPT;

@Client(id = "renderer")
public interface RendererClient {

    @Post("/render/svg")
    @Header(name = ACCEPT, value = "image/svg+xml")
    String renderSvg(@Header String authorization, Source data);

    @Post("/render/svg/batch")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    List<Source> renderSvgBatch(@Header String authorization, List<Source> data);

    @Post("/render/svg")
    @Header(name = ACCEPT, value = "image/svg+xml")
    byte[] exportSvg(@Header String authorization, Source data);

    @Post("/render/png")
    @Header(name = ACCEPT, value = MediaType.IMAGE_PNG)
    byte[] exportPng(@Header String authorization, Source data);

    @Post("/render/json")
    @Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
    byte[] exportJson(@Header String authorization, Source data);

}
