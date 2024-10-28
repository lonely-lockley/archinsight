package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.graphviz.GraphvizTranslator;
import com.github.lonelylockley.archinsight.introspect.Introspection;
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
        // !!!! temporarily set arch level
        data.setLevel(ArchLevel.CONTEXT);
        // ===============================
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
            translateParsed(data, result, ctx);
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

//    private void translateParsed(TranslationRequest data, TranslationResult result, TranslationContext ctx) {
//        result.setTabs(data.getTabs());
//        var tabToDescriptor = ctx
//            .getDescriptors()
//            .stream()
//            .filter(desc -> desc.getLevel() == data.getLevel() && desc.getRoot().getOrigin().getTab().isPresent())
//            .collect(Collectors.groupingBy(
//                desc -> desc.getRoot().getOrigin().getTab().get().getTabId(),
//                Collectors.mapping(
//                        Function.identity(), Collectors.toList()
//                )
//            ));
//        for (TabData tab : result.getTabs()) {
//            var tr = new GraphvizTranslator();
//            var desc = tabToDescriptor.get(tab.getTabId());
//            tab.setSource(desc == null ? GraphvizTranslator.empty("empty") : tr.translate(desc));
//            if (Objects.equals(tab.getTabId(), data.getTabId())) {
//                result.setEdited(tab);
//            }
//        }
//    }

    private void translateParsed(TranslationRequest data, TranslationResult result, TranslationContext ctx) {
        result.setTabs(data.getTabs());
        var tabToDescriptor = ctx
                .getDescriptors()
                .stream()
                .filter(desc -> desc.getLevel() == data.getLevel())
                .flatMap(desc -> desc.getOrigins().stream().map(origin -> new Tuple2<>(origin, desc)))
                .filter(t -> t._1.getTab().isPresent())
                .collect(Collectors.groupingBy(t -> t._1.getTabId(), Collectors.toList()));
        for (TabData tab : result.getTabs()) {
            var tr = new GraphvizTranslator();
            var desc = tabToDescriptor.get(tab.getTabId());
            tab.setSource(desc == null ? GraphvizTranslator.empty("empty") : tr.translate(desc.getFirst()._2));
            if (Objects.equals(tab.getTabId(), data.getTabId())) {
                result.setEdited(tab);
            }
        }
    }

    private List<DeclarationContext> extractDeclarations(TranslationContext ctx) {
        var result = new ArrayList<DeclarationContext>(ctx.getDescriptors().size());
//        for (ParseDescriptor pfd : ctx.getDescriptors()) {
//            var dc = new DeclarationContext();
//            dc.setFileId(pfd.getFileId().orElse(null));
//            dc.setTabId(pfd.getTabId().orElse(null));
////            dc.setLevel(pfd.getLevel().name());
//            dc.setDeclaredId(pfd.getContext());
//            dc.setLocation(pfd.getLocation());
//            var sub = new ArrayList<Declaration>(ctx.getDescriptors().size());
//            for (Map.Entry<String, AbstractElement> entry : pfd.getDeclarations().entrySet()) {
//                var le = entry.getValue();
//                if (!le.isImported() && (le.getType() == SYSTEM || le.getType() == ACTOR || le.getType() == SERVICE || le.getType() == STORAGE)) {
//                    var decl = new Declaration();
//                    decl.setId(le.getUniqueId());
//                    decl.setDeclaredId(entry.getKey());
//                    le.hasParameters().foreach(withParameters -> decl.setName(withParameters.getName()));
//                    le.hasParameters().foreach(withParameters -> {
//                        if (withParameters.getName() != null) {
//                            decl.setName(withParameters.getName());
//                        }
//                        else {
//                            decl.setName(withParameters.getTechnology());
//                        }
//                    });
//                    decl.setExternal(le.hasExternal().mapOrElse(WithExternal::isExternal, () -> false));
//                    decl.setElementType(le.getType().getId());
//                    decl.setLine(le.getLine());
//                    decl.setCharPosition(le.getCharPosition());
//                    decl.setStartIndex(le.getStartIndex());
//                    decl.setStopIndex(le.getStopIndex());
//                    sub.add(decl);
//                }
//            }
//            if (!sub.isEmpty()) {
//                dc.setDeclarations(sub);
//                result.add(dc);
//            }
//        }
        return result;
    }

}
