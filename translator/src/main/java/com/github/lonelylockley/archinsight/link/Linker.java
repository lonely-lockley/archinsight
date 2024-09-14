package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.function.Function;

public class Linker {

    private final Map<String, ParsedFileDescriptor> namespaces = new HashMap<>();
    private final Map<String, Tuple2<String, AbstractImport>> declaredImports = new HashMap<>();
    private final TranslationContext ctx;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private WithChildElements transformToImported(AbstractElement copy, AbstractImport imported, AbstractElement root, ParsedFileDescriptor descriptor) {
        TranslationUtil.copyPosition(copy, imported.getIdentifierSource());
        copy.hasId().foreach(c -> c.setDeclaredId(imported.getAlias()));
        copy.hasChildren().foreach(c -> c.getChildren().clear());
        copy.hasExternal().foreach(WithExternal::setExternal);
        copy.setImported();
        // attach named imports to current container and anonymous imports to root container
        var container = root.hasChildren().mapOrElse(
                Function.identity(),
                () -> descriptor.getParseResult().getRoot().hasChildren().mapOrElse(Function.identity(), () -> { throw new RuntimeException("Could not find a suitable candidate to add imports"); })
        );
        return container;
    }

    private void rewriteImportsInternal(AbstractElement root, ParsedFileDescriptor descriptor) {
        if (root instanceof WithImports hasImports) {
            for (AbstractImport imported : hasImports.getImports()) {
                // if an element contains errors we still have to register empty element to declarations
                // to satisfy declarations check for anonymous imports
                AbstractElement copy = new EmptyElement(imported.getAlias());
                var namespaceLId = String.format("%s_%s", imported.getLevel(), imported.getNamespace());
                // create map for future use in mirroring
                declaredImports.put(imported.getAlias(), new Tuple2<>(namespaceLId, imported));
                // check for imports from the same namespace
                if (Objects.equals(descriptor.getNamespace(), imported.getNamespace())) {
                    var tm = TranslationUtil.newError(descriptor,
                        "Cyclic import detected"
                    );
                    TranslationUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getNamespaceSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check namespace exists
                if (!namespaces.containsKey(namespaceLId)) {
                    var tm = TranslationUtil.newError(descriptor,
                        String.format("Unsatisfied import: %s %s not found", TranslationUtil.stringify(imported.getLevel()), imported.getNamespace())
                    );
                    TranslationUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getNamespaceSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check that imported element is declared in namespace
                if (!namespaces.get(namespaceLId).isDeclared(imported.getIdentifier())) {
                    var tm = TranslationUtil.newError(descriptor,
                        String.format("Unsatisfied import: %s%s not found in %s %s", imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(), TranslationUtil.stringify(imported.getLevel()), imported.getNamespace())
                    );
                    TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check optional element type if it is set
                if (imported.getElement() != null && !Objects.equals(imported.getElement(), TranslationUtil.stringify(namespaces.get(namespaceLId).getDeclared(imported.getIdentifier()).getType()))) {
                    var tm = TranslationUtil.newError(descriptor,
                        String.format("Unsatisfied import: %s%s not found in %s %s. Did you mean %s?",
                                imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(),
                                TranslationUtil.stringify(imported.getLevel()), imported.getNamespace(),
                                TranslationUtil.stringify(namespaces.get(namespaceLId).getDeclared(imported.getIdentifier()).getType())
                        )
                    );
                    TranslationUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else
                // check imported element is not a boundary
                if (namespaces.get(namespaceLId) != null && namespaces.get(namespaceLId).getDeclared(imported.getAlias()) != null && Objects.equals(namespaces.get(namespaceLId).getDeclared(imported.getIdentifier()).getType(), ElementType.BOUNDARY)) {
                    var tm = TranslationUtil.newError(descriptor,
                            "Boundary cannot be imported"
                    );
                    TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                    ctx.addMessage(tm);
                }
                else {
                    // finally, if no problems found, create element copy
                    var originalDescriptor = namespaces.get(namespaceLId);
                    var originalElement = namespaces.get(namespaceLId).getDeclared(imported.getIdentifier());
                    imported.setOrigination(originalDescriptor, originalElement);
                    copy = originalElement.clone();
                    copy.hasExternal().filter(WithExternal::isExternal).foreach(external -> {
                        var tm = TranslationUtil.newError(descriptor,
                            "External element imported"
                        );
                        var charPosition = imported.getElementSource() == null ? imported.getIdentifierSource().getCharPosition() : imported.getElementSource().getCharPosition();
                        var start = imported.getElementSource() == null ? imported.getIdentifierSource().getStartIndex() : imported.getElementSource().getStartIndex();
                        var stop = imported.getIdentifierSource().getStopIndex();
                        TranslationUtil.copyPosition(tm, imported.getLine(), charPosition, start, stop);
                        ctx.addMessage(tm);
                    });
                }
                if (copy.getType() != ElementType.EMPTY) {
                    // copy position and fix copied attributes if needed
                    var container = transformToImported(copy, imported, root, descriptor);
                    container.addChild(copy);
                    descriptor.declare(copy.hasId().mapOrElse(WithId::getDeclaredId, null), copy);
                }
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

    private void addMirrorConnections(ParsedFileDescriptor descriptor) {
        // original descriptor with import statement that has to be mirrored
        descriptor
                .getConnections()
                .stream()
                .filter(le -> declaredImports.containsKey(le.getTo()))
                .forEach(le -> {
                    // original_to alias -> (namespaceLId, original import)
                    var namespaceAndImportStatement = declaredImports.get(le.getTo());
                    // original element referencing imported element
                    var originalFromElement = descriptor.getDeclared(le.getFrom());
                    // mirrored element
                    var mirrored = originalFromElement.clone();
                    // target descriptor to mirror element and link
                    var targetDescriptor = namespaces.get(namespaceAndImportStatement._1);
                    if (targetDescriptor != null) {
                        // container element in target descriptor with mirror element added
                        var container = transformToImported(mirrored, namespaceAndImportStatement._2, targetDescriptor.getParseResult().getRoot(), targetDescriptor);
                        var alreadyImported = targetDescriptor
                                .getImports()
                                .stream()
                                .filter(imp -> {
                                    return Objects.equals(imp.getNamespace(), descriptor.getNamespace()) && Objects.equals(imp.getLevel(), descriptor.getLevel()) && Objects.equals(imp.getIdentifier(), le.getFrom());
                                })
                                .findFirst();
                        String newId;
                        if (alreadyImported.isPresent()) {
                            newId = alreadyImported.get().getAlias();
                        }
                        else {
                            newId = String.format("%s_%s_%s", descriptor.getLevel(), descriptor.getNamespace(), le.getFrom());
                        }
                        mirrored.hasId().foreach(withId -> withId.setDeclaredId(newId));
                        // - if original element is imported into target namespace
                        if (!targetDescriptor.isDeclared(newId)) {
                            container.addChild(mirrored);
                            targetDescriptor.declare(newId, mirrored);
                        }
                        // create a reversed link from mirrored element to imported one
                        var reverseLink = (LinkElement) le.clone();
                        // copy link and reverse direction
                        reverseLink.setFrom(newId);
                        if (namespaceAndImportStatement._2.getOriginalElement() != null) {
                            reverseLink.setTo(namespaceAndImportStatement._2.getOriginalElement().hasId().mapOrElse(WithId::getDeclaredId, null));
                        }
                        targetDescriptor.connect(reverseLink);
                        container.addChild(reverseLink);
                    }
                });
        declaredImports.clear();
    }

    private void checkNamespace(ParsedFileDescriptor descriptor) {
        // LId - level id
        var namespaceLId = String.format("%s_%s", descriptor.getLevel(), descriptor.getNamespace());
        if (namespaces.containsKey(namespaceLId)) {
            var tm = TranslationUtil.newError(descriptor, descriptor.getParseResult().getRoot(),
                String.format("Duplicate namespace definition declared in file %s", namespaces.get(namespaceLId).getLocation())
            );
            ctx.addMessage(tm);
        }
        else {
            namespaces.put(namespaceLId, descriptor);
        }
    }

    private void checkDeclarations(ParsedFileDescriptor descriptor, AbstractElement el) {
        if (el.getType() == ElementType.LINK) {
            ElementType.LINK.capture(el).foreach(link -> {
                if (descriptor.getConnections().contains(link)) {
                    var tm = TranslationUtil.newWarning(descriptor, el,
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
            var id = el.hasId().mapOrElse(WithId::getDeclaredId, () -> {
                throw new RuntimeException(String.format("Element of type %s is not supposed to have an identifier", el.getType()));
            });
            if (descriptor.isDeclared(id)) {
                var tm = TranslationUtil.newError(descriptor, el,
                    String.format("Identifier %s is already defined", id)
                );
                ctx.addMessage(tm);
            }
            else {
                descriptor.declare(id, el);
            }
        }
        el.hasImports().foreach(imports -> {
            imports.getImports().forEach(imp -> {
                    var id = imp.getAlias();
                    if (descriptor.isDeclared(id)) {
                        var tm = TranslationUtil.newError(descriptor, el, String.format("Identifier %s is already defined", id));
                        ctx.addMessage(tm);
                    } else {
                        descriptor.declare(id, el);
                    }
                });
            descriptor.declareForeign(imports);
        });
        el.hasChildren().foreach(hasChildren -> hasChildren.getChildren().forEach(ch -> checkDeclarations(descriptor, ch)));
    }

    private void checkConnections(ParsedFileDescriptor descriptor) {
        descriptor.getConnections()
            .stream()
            .filter(c -> !descriptor.isDeclared(c.getTo()))
            .filter(c -> !(c.getTo().startsWith("CONTEXT_") || c.getTo().startsWith("CONTAINER_")))
            .forEach(el -> {
                var tm = TranslationUtil.newError(descriptor, el,
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
            addMirrorConnections(descriptor);
            checkConnections(descriptor);
        }
    }

}
