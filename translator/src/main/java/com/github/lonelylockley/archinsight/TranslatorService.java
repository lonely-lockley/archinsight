package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.graphviz.GraphvizTranslator;
import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import com.github.lonelylockley.archinsight.parse.ParseResult;
import com.github.lonelylockley.archinsight.parse.InsightParseTreeListener;
import com.github.lonelylockley.archinsight.link.Linker;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.parse.Parser;
import com.github.lonelylockley.archinsight.remote.RepositoryClient;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
import com.github.lonelylockley.archinsight.tracing.Measured;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.runtime.Micronaut;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import jakarta.inject.Inject;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.antlr.v4.runtime.atn.PredictionMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.Objects;
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

    private void parseRepository(TranslationContext ctx, UUID fileId, UUID repositoryId, UUID ownerId, String ownerRole, String source) throws Exception {
        if (fileId != null && repositoryId != null) {
            var fs = new FileSystem(repository.listNodes(conf.getRepositoryAuthToken(), ownerId, ownerRole, repositoryId));
            var files = repository.openAllFiles(conf.getRepositoryAuthToken(), ownerId, ownerRole, repositoryId);
            for (FileData file : files) {
                if (!Objects.equals(file.getId(), fileId)) {
                    var location = fs.getPath(file.getId());
                    ctx.addDescriptor(new ParsedFileDescriptor(new Parser(ctx).parse(file.getContent(), file.getId(), fs.getPath(file.getId())), location, file.getId()));
                }
            }
            // parse the source from client
            var location = fs.getPath(fileId);
            ctx.setEdited(new ParsedFileDescriptor(new Parser(ctx).parse(source, fileId, location), location, fileId));
        }
        else {
            // parse the source from client
            var location = "/";
            ctx.setEdited(new ParsedFileDescriptor(new Parser(ctx).parse(source, null, location), location, null));
        }
    }

    @Post
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Measured
    public TranslationResult translate(HttpRequest<TranslationRequest> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole, TranslationRequest data) throws Exception {
        var ctx = new TranslationContext();
        // parse the whole repository if a file belongs to some
        parseRepository(ctx, data.getFileId(), data.getRepositoryId(), ownerId, ownerRole, data.getSource());
        // check integrity
        new Linker(ctx).checkIntegrity();
        // translate to DOT
        var result = new TranslationResult();
        result.setMessages(ctx.getMessages());
        result.setSource(new GraphvizTranslator().translate(ctx.getEdited().getParseResult()));
        return result;
    }

}
