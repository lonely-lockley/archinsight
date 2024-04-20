package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.imports.NamedImport;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.function.Function;

public class Linker {


    private final Map<String, ParsedFileDescriptor> namespaces = new HashMap<>();
    private final TranslationContext ctx;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void rewriteImportsInternal(AbstractElement root, ParsedFileDescriptor descriptor) {
        if (root instanceof WithImports hasImports) {
            for (AbstractImport imported : hasImports.getImports()) {
                // if an element contains errors we still have to register empty element to declarations
                // to satisfy declarations check for anonymous imports
                AbstractElement copy = new EmptyElement(imported.getAlias());
                var namespaceLId = String.format("%s_%s", imported.getLevel(), imported.getNamespace());
                // check for imports from the same namespace
                if (Objects.equals(descriptor.getNamespace(), imported.getNamespace())) {
                    var tm = LinkerUtil.newError(descriptor,
                        "Cyclic import detected"
                    );
                    LinkerUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getNamespaceSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check namespace exists
                if (!namespaces.containsKey(namespaceLId)) {
                    var tm = LinkerUtil.newError(descriptor,
                        String.format("Unsatisfied import: %s %s not found", imported.getLevel().toString().toLowerCase(), imported.getNamespace())
                    );
                    LinkerUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getNamespaceSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check that imported element is declared in namespace
                if (!namespaces.get(namespaceLId).isDeclared(imported.getIdentifier())) {
                    var tm = LinkerUtil.newError(descriptor,
                        String.format("Unsatisfied import: %s%s not found in %s %s", imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(), imported.getLevel().toString().toLowerCase(), imported.getNamespace())
                    );
                    LinkerUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check optional element type if it is set
                if (imported.getElement() != null && !Objects.equals(imported.getElement(), namespaces.get(namespaceLId).getDeclared(imported.getIdentifier()).getType().toString().toLowerCase())) {
                    var tm = LinkerUtil.newError(descriptor,
                        String.format("Unsatisfied import: %s%s not found in %s %s. Did you mean %s?",
                                imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(),
                                imported.getLevel().toString().toLowerCase(), imported.getNamespace(),
                                namespaces.get(namespaceLId).getDeclared(imported.getIdentifier()).getType().toString().toLowerCase()
                        )
                    );
                    LinkerUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check imported element is not a boundary
                if (namespaces.get(namespaceLId) != null && namespaces.get(namespaceLId).getDeclared(imported.getAlias()) != null && Objects.equals(namespaces.get(namespaceLId).getDeclared(imported.getAlias()).getType().toString().toLowerCase(), ElementType.BOUNDARY.toString().toLowerCase())) {
                    var tm = LinkerUtil.newError(descriptor,
                            "Boundary cannot be imported"
                    );
                    LinkerUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else {
                    // finally, if no problems found, create element copy
                    var el = namespaces.get(namespaceLId).getDeclared(imported.getIdentifier());
                    copy = el.clone();
                    copy.hasExternal().filter(WithExternal::isExternal).foreach(external -> {
                        var tm = LinkerUtil.newError(descriptor,
                            "External element imported"
                        );
                        LinkerUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                        ctx.addMessage(tm);
                    });
                }

                // copy position and fix copied attributes if needed
                LinkerUtil.copyPosition(copy, imported.getIdentifierSource());
                copy.hasId().foreach(c -> c.setId(imported.getAlias()));
                copy.hasChildren().foreach(c -> c.getChildren().clear());
                copy.hasExternal().foreach(WithExternal::setExternal);
                // attach named imports to current container and anonymous imports to root container
                var container = root.hasChildren().mapOrElse(
                        Function.identity(),
                        () -> descriptor.getParseResult().getRoot().hasChildren().mapOrElse(Function.identity(), () -> { throw new RuntimeException("Could not find a suitable candidate to add imports"); })
                    );
                container.addChild(copy);
                descriptor.declare(copy.hasId().mapOrElse(WithId::getId, null), copy);
            }
        }
        root.hasChildren().foreach(hasChildren -> {
            var children = new ArrayList<AbstractElement>(hasChildren.getChildren().size());
            children.addAll(hasChildren.getChildren());
            children.forEach(ch -> rewriteImportsInternal(ch, descriptor));
        });
    }

    private void rewriteImports(ParsedFileDescriptor descriptor) {
        rewriteImportsInternal(descriptor.getParseResult().getRoot(), descriptor);
    }

    private void checkNamespace(ParsedFileDescriptor descriptor) {
        // LId - level id
        var namespaceLId = String.format("%s_%s", descriptor.getLevel(), descriptor.getNamespace());
        if (namespaces.containsKey(namespaceLId)) {
            var tm = LinkerUtil.newError(descriptor, descriptor.getParseResult().getRoot(),
                String.format("Duplicate namespace definition declared in file %s", namespaces.get(namespaceLId).getLocation())
            );
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
            ElementType.LINK.capture(el).foreach(link -> {
                if (descriptor.getConnections().contains(link)) {
                    var tm = LinkerUtil.newWarning(descriptor, el,
                            "Possible link duplication"
                    );
                    ctx.addMessage(tm);
                }
                else {
                    descriptor.connect(link);
                }
            });
        }
        else
        if (el.getType() != ElementType.CONTEXT && el.getType() != ElementType.CONTAINER) {
            var id = el.hasId().mapOrElse(WithId::getId, () -> {
                throw new RuntimeException(String.format("Element of type %s is not supposed to have an identifier", el.getType()));
            });
            if (descriptor.isDeclared(id)) {
                var tm = LinkerUtil.newError(descriptor, el,
                    String.format("Identifier %s is already defined", id)
                );
                ctx.addMessage(tm);
            }
            else {
                descriptor.declare(id, el);
            }
        }
        if (el instanceof WithImports hasImports) {
            for (AbstractImport imported : hasImports.getImports()) {
                if (imported instanceof NamedImport namedImport) {
                    String id = namedImport.getAlias();
                    if (descriptor.isDeclared(id)) {
                        var tm = LinkerUtil.newError(descriptor, el, String.format("Identifier %s is already defined", id));
                        ctx.addMessage(tm);
                    } else {
                        descriptor.declare(id, el);
                    }
                }
            }
        }
        el.hasImports().foreach(descriptor::declareForeign);
        el.hasChildren().foreach(hasChildren -> hasChildren.getChildren().forEach(ch -> checkDeclarations(descriptor, ch)));
    }


    private void checkConnections(ParsedFileDescriptor descriptor) {
        descriptor.getConnections()
            .stream()
            .filter(c ->
                    !descriptor.isDeclared(c.getTo()))
            .forEach(el -> {
                var tm = LinkerUtil.newError(descriptor, el,
                    String.format("Undeclared identifier %s", el.getTo())
                );
                ctx.addMessage(tm);
            });
    }

    public void checkIntegrity() {
        for (ParsedFileDescriptor descriptor : ctx.getDescriptors()) {
            checkNamespace(descriptor);
            checkDeclarations(descriptor, descriptor.getParseResult().getRoot());
        }
        for (ParsedFileDescriptor descriptor : ctx.getDescriptors()) {
            rewriteImports(descriptor);
            checkConnections(descriptor);
        }
    }

}
