package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.graphviz.GraphvizTranslator;
import com.github.lonelylockley.archinsight.introspect.Introspection;
import com.github.lonelylockley.archinsight.model.TabBoundedFileData;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.translator.TabData;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import com.github.lonelylockley.archinsight.link.Linker;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.util.stream.Collectors;

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
        var ctx = new TranslationContext();
        var fsFuture = CompletableFuture
                .supplyAsync(() -> repository.listNodes(conf.getRepositoryAuthToken(), ownerId, ownerRole, data.getRepositoryId()))
                .thenApply(FileSystem::new);
        var allFilesFuture = CompletableFuture
                .supplyAsync(() -> repository.openAllFiles(conf.getRepositoryAuthToken(), ownerId, ownerRole, data.getRepositoryId()))
                .thenApply(files -> mergeSources(data, files));
        // parse the whole repository
        new Parser(ctx).parseRepository(ctx, fsFuture.get(), allFilesFuture.get());
        // check integrity
        if (!ctx.hasErrors()) {
            new Linker(ctx).checkIntegrity();
            new Introspection(ctx).suggest();
        }
        // translate to DOT
        var result = new TranslationResult();
        result.setTabId(data.getTabId());
        if (!ctx.hasErrors()) {
            mergeResults(data, result, ctx);
        }
        else {
            result.setHasErrors(true);
        }
        result.setMessages(ctx.getMessages());
        return result;
    }

    private List<TabBoundedFileData> mergeSources(TranslationRequest data, List<FileData> allFiles) {
        final var files = allFiles
                        .stream()
                        .map(TabBoundedFileData::new)
                        .collect(Collectors.toMap(TabBoundedFileData::getId, Function.identity()));
        final var tabs = data.getTabs()
                .stream()
                .map(tab -> {
                    TabBoundedFileData tmp;
                    if (tab.getFileId() == null || !files.containsKey(tab.getFileId())) {
                        tmp = new TabBoundedFileData();
                        tmp.setTabId(tab.getTabId());
                        tmp.setFileName(tab.getFileName());
                        tmp.setContent(tab.getSource());

                    }
                    else {
                        tmp = files.remove(tab.getFileId());
                        tmp.setTabId(tab.getTabId());
                        tmp.setContent(tab.getSource());
                    }
                    return tmp;
                })
                .sorted((left, right) -> {
                    if (Objects.equals(left.getTabId(), data.getTabId())) {
                        return 1;
                    }
                    else
                    if (Objects.equals(right.getTabId(), data.getTabId())) {
                        return -1;
                    }
                    else {
                        return 0;
                    }

                })
                .toList();
        var res = new ArrayList<TabBoundedFileData>(files.size() + tabs.size());
        res.addAll(files.values());
        res.addAll(tabs);
        return res;
    }

    private void mergeResults(TranslationRequest data, TranslationResult result, TranslationContext ctx) {
        result.setTabs(data.getTabs());
        for (TabData tab : result.getTabs()) {
            var tr = new GraphvizTranslator();
            tab.setSource(tr.translate(ctx.getDescriptor(tab.getTabId())));
            if (Objects.equals(tab.getTabId(), data.getTabId())) {
                result.setEdited(tab);
            }
        }
    }

}
