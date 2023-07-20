package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.client.annotation.Client;

import static io.micronaut.http.HttpHeaders.ACCEPT;
import static io.micronaut.http.HttpHeaders.CONTENT_TYPE;

@Client(id = "${RENDERER}")
@Header(name = CONTENT_TYPE, value = "application/json")
public interface RendererClient {

    @Post("/render/svg")
    @Header(name = ACCEPT, value = "image/svg+xml")
    String renderSvg(Source data);

}
