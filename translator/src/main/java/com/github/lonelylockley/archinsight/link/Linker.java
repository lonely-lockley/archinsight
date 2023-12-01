package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.imports.NamedImport;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.elements.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class Linker {

    private static final Logger logger = LoggerFactory.getLogger(Linker.class);

    private final Map<String, ParsedFileDescriptor> namespaces = new HashMap<>();
    private final TranslationContext ctx;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void rewriteImportsInternal(AbstractElement root, ParsedFileDescriptor edited) {
        if (root instanceof WithImports hasImports) {
            for (AbstractImport imported : hasImports.getImports()) {
                AbstractElement copy = new EmptyElement(imported.getAlias());
                var namespaceLId = String.format("%s_%s", imported.getLevel(), imported.getNamespace());
                if (Objects.equals(edited.getNamespace(), imported.getNamespace())) {
                    TranslatorMessage tm = new TranslatorMessage(
                            MessageLevel.ERROR,
                            edited.getId(),
                            edited.getLocation(),
                            "Cyclic import detected"
                    );
                    SourcePositionUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getNamespaceSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                if (!namespaces.containsKey(namespaceLId)) {
                    TranslatorMessage tm = new TranslatorMessage(
                            MessageLevel.ERROR,
                            edited.getId(),
                            edited.getLocation(),
                            String.format("Unsatisfied import: %s %s not found", imported.getLevel().toString().toLowerCase(), imported.getNamespace())
                    );
                    SourcePositionUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getNamespaceSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                if (!namespaces.get(namespaceLId).isDeclared(imported.getIdentifier())) {
                    TranslatorMessage tm = new TranslatorMessage(
                            MessageLevel.ERROR,
                            edited.getId(),
                            edited.getLocation(),
                            String.format("Unsatisfied import: %s%s not found in %s %s", imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(), imported.getLevel().toString().toLowerCase(), imported.getNamespace())
                    );
                    SourcePositionUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                if (imported.getElement() != null) {
                    var el = (AbstractElement) namespaces.get(namespaceLId).getDeclared(imported.getIdentifier());
                    if (!Objects.equals(imported.getElement(), el.getType().toString().toLowerCase())) {
                        TranslatorMessage tm = new TranslatorMessage(
                                MessageLevel.ERROR,
                                edited.getId(),
                                edited.getLocation(),
                                String.format("Unsatisfied import: %s%s not found in %s %s. Did you mean %s?", imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(), imported.getLevel().toString().toLowerCase(), imported.getNamespace(), el.getType().toString().toLowerCase())
                        );
                        SourcePositionUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                        ctx.addMessage(tm);
                    }
                }
                else {
                    // finally, create element copy
                    var el = (AbstractElement) namespaces.get(namespaceLId).getDeclared(imported.getIdentifier());
                    copy = (AbstractElement) el.clone();
                    if (copy instanceof WithExternal external && external.isExternal()) {
                        TranslatorMessage tm = new TranslatorMessage(
                                MessageLevel.ERROR,
                                edited.getId(),
                                edited.getLocation(),
                                "External element imported"
                        );
                        SourcePositionUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                        ctx.addMessage(tm);
                    }
                }

                // copy position and fix copied attributes if needed
                SourcePositionUtil.copyPosition(copy, imported.getIdentifierSource());
                if (copy instanceof WithId hasId) {
                    hasId.setId(imported.getAlias());
                }
                if (copy instanceof WithChildElements hasChildren) {
                    hasChildren.getChildren().clear();
                }
                if (copy instanceof WithExternal hasExternal) {
                    hasExternal.setExternal();
                }
                // attach named imports to current container and anonymous imports to root container
                WithChildElements container;
                if (imported instanceof NamedImport) {
                    container = (WithChildElements) root;
                }
                else {
                    container = (WithChildElements) edited.getParseResult().getRoot();
                }
                container.addChild(copy);
            }
        }
        if (root instanceof WithChildElements hasChildren) {
            var children = new ArrayList<AbstractElement>(hasChildren.getChildren().size());
            children.addAll(hasChildren.getChildren());
            children.forEach(ch -> rewriteImportsInternal(ch, edited));
        }
    }

    private void rewriteImports(ParsedFileDescriptor edited) {
        rewriteImportsInternal(edited.getParseResult().getRoot(), edited);
    }

    private void checkNamespace(ParsedFileDescriptor descriptor) {
        // LId - level id
        var namespaceLId = String.format("%s_%s", descriptor.getLevel(), descriptor.getNamespace());
        if (namespaces.containsKey(namespaceLId)) {
            TranslatorMessage tm = new TranslatorMessage(
                    MessageLevel.ERROR,
                    descriptor.getId(),
                    descriptor.getLocation(),
                    String.format("Duplicate namespace definition declared in file %s", namespaces.get(namespaceLId).getLocation())
            );
            SourcePositionUtil.copyPosition(tm, descriptor.getParseResult().getRoot());
            ctx.addMessage(tm);
        }
        else {
            namespaces.put(namespaceLId, descriptor);
        }
    }

    private void checkNamespaces(List<ParsedFileDescriptor> projectDescriptors, ParsedFileDescriptor edited) {
        for (ParsedFileDescriptor descriptor: projectDescriptors) {
            checkNamespace(descriptor);
        }
        checkNamespace(edited);
    }

    private void checkDeclarations(ParsedFileDescriptor descriptor, AbstractElement el) {
        if (el.getType() == ElementType.LINK) {
            var link = (LinkElement) el;
            if (descriptor.getConnections().contains(link)) {
                TranslatorMessage tm = new TranslatorMessage(
                        MessageLevel.WARNING,
                        descriptor.getId(),
                        descriptor.getLocation(),
                        "Possible link duplication"
                );
                SourcePositionUtil.copyPosition(tm, el);
                ctx.addMessage(tm);
            }
            else {
                descriptor.connect((LinkElement) el);
            }
        }
        else
        if (el.getType() != ElementType.CONTEXT && el.getType() != ElementType.CONTAINER) {
            var id = ((WithId) el).getId();
            if (descriptor.isDeclared(id)) {
                TranslatorMessage tm = new TranslatorMessage(
                        MessageLevel.ERROR,
                        descriptor.getId(),
                        descriptor.getLocation(),
                        String.format("Identifier %s is already defined", id)
                );
                SourcePositionUtil.copyPosition(tm, el);
                ctx.addMessage(tm);
            }
            else {
                descriptor.declare((WithId) el);
            }
        }
        if (el instanceof WithImports hasImports) {
            descriptor.declareForeign(hasImports);
        }
        if (el instanceof WithChildElements hasChildren) {
            hasChildren.getChildren().forEach(ch -> checkDeclarations(descriptor, ch));
        }
    }

    private void checkConnections(ParsedFileDescriptor descriptor) {
        descriptor.getConnections()
            .stream()
            .filter(c -> !descriptor.isDeclared(c.getTo()))
            .forEach(el -> {
                TranslatorMessage tm = new TranslatorMessage(
                        MessageLevel.ERROR,
                        descriptor.getId(),
                        descriptor.getLocation(),
                        String.format("Undeclared identifier %s", el.getTo())
                );
                SourcePositionUtil.copyPosition(tm, el);
                ctx.addMessage(tm);
            });
    }

    public void checkIntegrity() {
        var edited = ctx.getEdited();
        checkNamespaces(ctx.getDescriptors(), edited);
        for (ParsedFileDescriptor descriptor : ctx.getDescriptors()) {
            checkDeclarations(descriptor, descriptor.getParseResult().getRoot());
        }
        rewriteImports(edited);
        checkDeclarations(edited, edited.getParseResult().getRoot());
        checkConnections(edited);
    }

}
