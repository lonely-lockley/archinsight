package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.graphviz.GraphvizTranslator;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import com.github.lonelylockley.archinsight.link.Linker;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.parse.Parser;
import com.github.lonelylockley.archinsight.remote.RepositoryClient;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

@Controller("/translate")
@Secured(SecurityRule.IS_AUTHENTICATED)
public class TranslatorService {

    private static final Logger logger = LoggerFactory.getLogger(TranslatorService.class);

    public static void main(String[] args) {
        Micronaut.run(TranslatorService.class, args);
        logger.info("Translator server started");
    }

    @Inject
    private RepositoryClient repository;
    @Inject
    private Config conf;

    @Post
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public TranslationResult translate(HttpRequest<TranslationRequest> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole, TranslationRequest data) throws Exception {
        var ctx = new TranslationContext();
        var fs = new FileSystem(repository.listNodes(conf.getRepositoryAuthToken(), ownerId, ownerRole, data.getRepositoryId()));
        var files = repository.openAllFiles(conf.getRepositoryAuthToken(), ownerId, ownerRole, data.getRepositoryId());
        // parse the whole repository if a file belongs to some
        new Parser(ctx).parseRepository(ctx, fs, files, data.getFileId(), data.getRepositoryId(), data.getSource());
        // check integrity
        new Linker(ctx).checkIntegrity();
        // translate to DOT
        var result = new TranslationResult();
        if (!ctx.hasErrors()) {
            result.setSource(new GraphvizTranslator().translate(ctx.getEdited()));
        }
        else {
            result.setHasErrors(true);
        }
        result.setMessages(ctx.getMessages());
        return result;
    }

}
