package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Header;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.client.annotation.Client;

import static io.micronaut.http.HttpHeaders.ACCEPT;
import static io.micronaut.http.HttpHeaders.CONTENT_TYPE;

@Client(id = "translator")
@Header(name = ACCEPT, value = MediaType.APPLICATION_JSON)
@Header(name = CONTENT_TYPE, value = MediaType.APPLICATION_JSON)
public interface TranslatorClient {

    @Post("/translate")
    TranslationResult translate(@Header String authorization, @Body TranslationRequest data);

}
