package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.imports.GeneratedImport;
import com.github.lonelylockley.archinsight.model.imports.NamedImport;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

public interface Imports {

    default void initializeImports(ContextElement context, ParseDescriptor descriptor, TranslationContext ctx) {
        initializeImports(context, context.getImports(), descriptor, ctx);
    }

    default void initializeImports(ContainerElement container, ParseDescriptor descriptor, TranslationContext ctx) {
        initializeImports(container, container.getImports(), descriptor, ctx);
    }

    private void initializeImports(AbstractElement el, List<AbstractImport> imports, ParseDescriptor descriptor, TranslationContext ctx) {
        imports
            .forEach(imported -> {
                descriptor.addImport(imported);
                if (!imported.isAnonymous()) {
                    var id = imported.getAlias();
                    if (descriptor.isDeclared(id)) {
                        var tm = TranslationUtil.newError(el, String.format("Identifier %s is already defined", id));
                        ctx.addMessage(tm);
                    }
                    else {
                        var ee = new EmptyElement(id);
                        ee.setOrigin(imported.getOrigin());
                        descriptor.declareImported(id, ee);
                    }
                }
            });
    }

    default void rewriteImports(ParseDescriptor descriptor, TranslationContext ctx) {
        final var imports = new ArrayList<AbstractImport>();
        imports.addAll(descriptor.getImports());
        if (descriptor.getParentContext() != null) {
            imports.addAll(descriptor.getParentContext().getImports());
        }
        final var split = imports
                        .stream()
                        .collect(Collectors.groupingBy(
                                AbstractImport::isAnonymous,
                                Collectors.toList()
                        ));
        // collect named imports
        final var named = split
                        .getOrDefault(false, Collections.emptyList())
                        .stream()
                        .collect(Collectors.toMap(AbstractImport::getAlias, Function.identity(), (left, right) -> right));
        // fix anonymous imports aliases by adding missing information from named
        final var remapping = new HashMap<String, String>();
        split.getOrDefault(true, Collections.emptyList()).forEach(anon -> {
            if (named.containsKey(anon.getElement())) {
                // anonymous imports from container element imported with named import
                var system = named.get(anon.getElement());
                var res = new GeneratedImport();
                res.setLevel(anon.getLevel());
                res.setLevelSource(system.getLevelSource());
                res.setBoundedContext(system.getBoundedContext());
                res.setBoundedContextSource(system.getBoundedContextSource());
                res.setIdentifier(system.getIdentifier());
                res.setIdentifierSource(system.getIdentifierSource());
                res.setAlias(anon.getElement());
                res.setAliasSource(anon.getAliasSource());
                res.setElement(anon.getIdentifier());
                res.setElementSource(anon.getElementSource());
                res.setOrigination(anon.getOriginalDescriptor(), anon.getOriginalElement());
                anon.clonePositionTo(res);
                remapping.put(anon.getAlias(), res.getAlias());
                descriptor.replaceImport(anon, res);
            }
            else
            if ((descriptor.getLevel() == ArchLevel.CONTEXT && descriptor.exists(anon.getElement()) && Objects.equals(descriptor.getExisting(anon.getElement()).getOrigin(), anon.getOrigin())) ||
                    (descriptor.getLevel() == ArchLevel.CONTAINER && descriptor.exists(anon.getIdentifier()) && Objects.equals(descriptor.getExisting(anon.getIdentifier()).getOrigin(), anon.getOrigin()))) {
                // anonymous imports in the same file without corresponding named import
                var res = new GeneratedImport();
                res.setLevel(anon.getLevel());
                res.setBoundedContext(descriptor.getBoundedContext());
                res.setIdentifier(anon.getElement());
                res.setAlias(anon.getElement());
                res.setAliasSource(anon.getAliasSource());
                res.setElement(anon.getIdentifier());
                res.setElementSource(anon.getElementSource());
                res.setOrigination(anon.getOriginalDescriptor(), anon.getOriginalElement());
                anon.clonePositionTo(res);
                remapping.put(anon.getAlias(), res.getAlias());
                descriptor.replaceImport(anon, res);
            }
            else {
                var tm = TranslationUtil.newError(anon,
                        String.format("Undeclared identifier %s", anon.getElement())
                );
                TranslationUtil.copyPosition(tm, anon.getLine(), anon.getElementSource().getCharPosition(), anon.getElementSource().getStartIndex(), anon.getElementSource().getStopIndex());
                ctx.addMessage(tm);
            }
        });
        // remap connections to correct anonymous aliases and declare named imports
        descriptor.getConnections().forEach(connection -> {
            if (remapping.containsKey(connection.getTo())) {
                connection.setTo(remapping.get(connection.getTo()));
            }
            if (named.containsKey(connection.getTo()) && !descriptor.exists(connection.getTo())) {
                descriptor.declareImported(connection.getTo(), new EmptyElement());
            }
        });
    }

    default void checkImports(ParseDescriptor descriptor, TranslationContext ctx) {
        if (ctx.hasErrors()) {
            return;
        }
        for (AbstractImport imported : descriptor.getImports()) {
            var namespaceId = LinkHelper.createBoundedContextUniqueId(imported.getLevel(), imported);
            // check namespace exists
            if (!ctx.hasDescriptor(namespaceId)) {
                TranslatorMessage tm;
                if (imported.getLevel() == ArchLevel.CONTEXT) {
                    tm = TranslationUtil.newError(imported,
                            String.format("Unsatisfied import: %s %s not found", TranslationUtil.stringify(imported.getLevel()), imported.getBoundedContext())
                    );
                }
                else {
                    tm = TranslationUtil.newError(imported,
                            String.format("Unsatisfied import: %s not found in %s", imported.getIdentifier(), imported.getElement())
                    );
                }
                TranslationUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getBoundedContextSource().getStopIndex());
                ctx.addMessage(tm);
            }
            else
            // check that imported element is declared in namespace
            if (!ctx.getDescriptor(namespaceId).exists(imported.getLevel() == ArchLevel.CONTEXT ? imported.getIdentifier() : imported.getElement())) {
                var tm = TranslationUtil.newError(imported,
                        String.format("Unsatisfied import: %s not found in %s %s", imported.getIdentifier(), TranslationUtil.stringify(imported.getLevel()), imported.getBoundedContext())
                );
                TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                ctx.addMessage(tm);
            }
        }
    }



}
