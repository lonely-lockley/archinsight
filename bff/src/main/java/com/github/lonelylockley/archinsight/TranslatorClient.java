package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Source;
import com.github.lonelylockley.archinsight.model.TranslatedSource;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.client.annotation.Client;

import static io.micronaut.http.HttpHeaders.ACCEPT;
import static io.micronaut.http.HttpHeaders.CONTENT_TYPE;

@Client(id = "${COMPILER}")
@Header(name = ACCEPT, value = "application/json")
@Header(name = CONTENT_TYPE, value = "application/json")
public interface TranslatorClient {

    @Post("/translate")
    TranslatedSource translate(Source data);

}
