package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.ColorScheme;
import com.github.lonelylockley.archinsight.export.Exporter;
import com.github.lonelylockley.archinsight.introspect.Introspection;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.WithExternal;
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
        if (ctx.noErrors()) {
            new Linker(ctx).checkIntegrity(data.getLevel());
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
        result.setDeclarations(extractDeclarations(ctx));
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
                .sorted((left, right) -> {  // sorting to put selected tab on top of stack. not very efficient though
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
        var res = new ArrayList<Origin>(files.size() + tabs.size());
        res.addAll(files.values());
        res.addAll(tabs);
        return res;
    }

    private List<DeclarationContext> extractDeclarations(TranslationContext ctx) {
        var result = new HashMap<Origin, DeclarationContext>();
        for (AbstractElement ae : ctx.getGlobalDeclaration()) {
            var dc = result.computeIfAbsent(ae.getOrigin(), origin -> {
                final var tmp = new DeclarationContext();
                tmp.setFileId(ae.getOrigin().getFileId());
                tmp.setTabId(ae.getOrigin().getTabId());
                tmp.setLocation(ae.getOrigin().getLocation());
                tmp.setLevel("context");
                ae.hasId().foreach(withId -> tmp.setDeclaredId(withId.getDeclaredId().toString()));
                return tmp;
            });
            if (ae.getType() == SYSTEM || ae.getType() == ACTOR || ae.getType() == SERVICE || ae.getType() == STORAGE) {
                var decl = new Declaration();
                decl.setId(ae.getUniqueId());
                ae.hasId().foreach(withId -> decl.setDeclaredId(withId.getDeclaredId().toString()));
                ae.hasParameters().foreach(withParameters -> decl.setName(withParameters.getName()));
                ae.hasParameters().foreach(withParameters -> {
                    if (withParameters.getName() != null) {
                        decl.setName(withParameters.getName());
                    }
                    else {
                        decl.setName(withParameters.getTechnology());
                    }
                });
                decl.setExternal(ae.hasExternal().fold(WithExternal::isExternal, () -> false));
                decl.setElementType(ae.getType().getId());
                decl.setLine(ae.getLine());
                decl.setCharPosition(ae.getCharPosition());
                decl.setStartIndex(ae.getStartIndex());
                decl.setStopIndex(ae.getStopIndex());
                dc.getDeclarations().add(decl);
            }
        }
        return new ArrayList<>(result.values());
    }

}
