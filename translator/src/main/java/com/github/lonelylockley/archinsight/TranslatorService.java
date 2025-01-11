package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.ColorScheme;
import com.github.lonelylockley.archinsight.export.Exporter;
import com.github.lonelylockley.archinsight.introspect.Introspection;
import com.github.lonelylockley.archinsight.link.SymbolCollector;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.translator.*;
import com.github.lonelylockley.archinsight.link.Linker;
import com.github.lonelylockley.archinsight.parse.Parser;
import com.github.lonelylockley.archinsight.remote.RepositoryClient;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.archinsight.security.SecurityConstants;
import com.github.lonelylockley.archinsight.tracing.Measured;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.*;
import io.micronaut.runtime.Micronaut;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.security.annotation.Secured;
import io.micronaut.security.rules.SecurityRule;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.github.lonelylockley.archinsight.model.elements.ElementType.*;

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
    @ExecuteOn(TaskExecutors.BLOCKING)
    @Measured
    public TranslationResult translate(HttpRequest<?> request, @Header(SecurityConstants.USER_ID_HEADER_NAME) UUID ownerId, @Header(SecurityConstants.USER_ROLE_HEADER_NAME) String ownerRole, @Body TranslationRequest data) throws Exception {
        final var ctx = new TranslationContext();
        final var fsFuture = CompletableFuture
                .supplyAsync(() -> repository.listNodes(conf.getRepositoryAuthToken(), ownerId, ownerRole, data.getRepositoryId()))
                .thenApply(FileSystem::new);
        final var allFilesFuture = CompletableFuture
                .supplyAsync(() -> repository.openAllFiles(conf.getRepositoryAuthToken(), ownerId, ownerRole, data.getRepositoryId()))
                .thenApply(files -> mergeSources(data, files));
        // parse the whole repository
        final var fs = fsFuture.join();
        new Parser(ctx).parseRepository(ctx, fs, allFilesFuture.join());
        // check integrity
        if (ctx.noErrors()) {
            new Linker(ctx).checkIntegrity();
            new Introspection(ctx).suggest();
        }
        // translate to DOT
        var result = new TranslationResult();
        result.setTabId(data.getTabId());
        if (ctx.noErrors()) {
            new Exporter().exportParsed(data, result, ctx, new ColorScheme(conf, data.getDarkMode()));
        }
        else {
            result.setHasErrors(true);
        }
        result.setSymbols(new SymbolCollector(fs, ctx).collect());
        result.setMessages(ctx.getMessages());
        return result;
    }

    private List<Origin> mergeSources(TranslationRequest data, List<FileData> allFiles) {
        final var files = allFiles
                        .stream()
                        .map(Origin::new)
                        .collect(Collectors.toMap(Origin::getFileId, Function.identity()));
        final var tabs = data.getTabs()
                .stream()
                .map(tab -> {
                    Origin tmp;
                    if (tab.getFileId() == null || !files.containsKey(tab.getFileId())) {
                        tmp = new Origin(tab);
                    }
                    else {
                        var fileData = files.remove(tab.getFileId());
                        tmp = new Origin(fileData.getFile(), tab);
                    }
                    return tmp;
                })
                .toList();
        var res = new ArrayList<Origin>(files.size() + tabs.size());
        res.addAll(files.values());
        res.addAll(tabs);
        return res;
    }

}
