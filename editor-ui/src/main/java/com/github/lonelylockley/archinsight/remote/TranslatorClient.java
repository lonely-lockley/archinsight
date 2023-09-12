package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.remote.translator.Source;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatedSource;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.client.annotation.Client;

import static io.micronaut.http.HttpHeaders.ACCEPT;
import static io.micronaut.http.HttpHeaders.CONTENT_TYPE;

@Client(id = "compiler")
@Header(name = ACCEPT, value = "application/json")
@Header(name = CONTENT_TYPE, value = "application/json")
public interface TranslatorClient {

    @Post("/translate")
    TranslatedSource translate(Source data);

}
